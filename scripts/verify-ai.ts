import "dotenv/config";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { db } from "../src/server/db";
import { processDraft, applyDraft, analyze } from "../src/server/ai";

async function main() {
  const user = await db.user.insert({
    data: {
      username: `ai-test-${randomUUID()}`,
      passwordHash: "isolated-test",
    },
  });
  const report: any = {
    testedAt: new Date().toISOString(),
    model: process.env.AI_TEXT_MODEL,
    checks: [],
  };
  async function processWithOneRetry(id: string) {
    await processDraft(user, id);
    const result = await db.captureDraft.require({ where: { id } });
    if (result.state === "failed") {
      report.checks.push({
        name: "人工重试路径",
        firstError: result.error,
        retry: true,
      });
      await processDraft(user, id, true);
    }
  }
  try {
    const draft = await db.captureDraft.insert({
      data: {
        ownerId: user.id,
        text: "今天工资到账8000元，午饭28元。",
        target: "ledger",
        capturedAt: new Date("2026-11-09T04:30:00Z"),
      },
    });
    await processWithOneRetry(draft.id);
    const textResult = await db.captureDraft.require({
      where: { id: draft.id },
    });
    assert.equal(
      textResult.state,
      "ready",
      textResult.error || "文字识别未完成",
    );
    const candidates = JSON.parse(textResult.result);
    console.log("Synthetic text candidates:", JSON.stringify(candidates));
    assert.ok(
      candidates.some(
        (c: any) => c.data.type === "income" && c.data.amount === 800000,
      ),
    );
    assert.ok(
      candidates.some(
        (c: any) => c.data.type === "expense" && c.data.amount === 2800,
      ),
    );
    assert.ok(candidates.every((c: any) => c.data.date === "2026-11-09"));
    report.checks.push({
      name: "真实文本识别与延后整理日期",
      passed: true,
      candidates: candidates.length,
    });

    await mkdir("data", { recursive: true });
    await mkdir("uploads", { recursive: true });
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    const page = await browser.newPage({
      viewport: { width: 600, height: 500 },
    });
    await page.setContent(
      '<html><body style="font-family:Arial,sans-serif;background:white;padding:32px;color:black;font-size:24px"><h1>TEST RECEIPT</h1><p>Date: 2026-11-10</p><p>Item: Cat food</p><p>Original total: CNY 100.00</p><p>Coupon discount: CNY 20.00</p><h2>Paid: CNY 80.00</h2></body></html>',
    );
    const image = await page.screenshot({ path: "data/ai-test-receipt.png" });
    await browser.close();
    const imageDraft = await db.captureDraft.insert({
      data: {
        ownerId: user.id,
        text: "识别这张测试收据，确认是实际优惠。",
        target: "ledger",
        capturedAt: new Date(),
      },
    });
    const storageKey = `ai-test-${randomUUID()}`;
    await writeFile(`uploads/${storageKey}`, image);
    await db.attachment.insert({
      data: {
        ownerId: user.id,
        draftId: imageDraft.id,
        storageKey,
        name: "synthetic-receipt.png",
        mime: "image/png",
        size: image.length,
        hash: createHash("sha256").update(image).digest("hex"),
      },
    });
    await processWithOneRetry(imageDraft.id);
    const visionResult = await db.captureDraft.require({
      where: { id: imageDraft.id },
    });
    assert.equal(
      visionResult.state,
      "ready",
      visionResult.error || "图片识别未完成",
    );
    const imageCandidates = JSON.parse(visionResult.result);
    const index = imageCandidates.findIndex(
      (c: any) =>
        c.data.type === "expense" &&
        c.data.amount === 8000 &&
        c.data.discount === 2000,
    );
    assert.ok(index >= 0, "图片实付或优惠识别不匹配");
    const operationId = randomUUID();
    const body = {
      operationId,
      id: visionResult.id,
      version: visionResult.version,
      selections: [{ index, candidate: imageCandidates[index] }],
    };
    await applyDraft(user, body);
    await applyDraft(user, body);
    assert.equal(
      await db.ledgerEntry.count({ where: { ownerId: user.id } }),
      1,
    );
    assert.equal(
      (await db.savingEntry.require({ where: { ownerId: user.id } }))
        .amount,
      2000,
    );
    report.checks.push({
      name: "真实截图输入、实付与优惠识别、确认自动入罐和幂等",
      passed: true,
      paid: 8000,
      discount: 2000,
    });

    const list = await db.shoppingList.insert({
      data: { ownerId: user.id, name: "测试超市" },
    });
    const shoppingDraft = await db.captureDraft.insert({
      data: {
        ownerId: user.id,
        text: "牛奶两盒，鸡蛋一打，洗衣液别超过五十元，要无香的。",
        target: "shopping",
        targetListId: list.id,
        capturedAt: new Date(),
      },
    });
    await processWithOneRetry(shoppingDraft.id);
    const shoppingResult = await db.captureDraft.require({
      where: { id: shoppingDraft.id },
    });
    assert.equal(
      shoppingResult.state,
      "ready",
      shoppingResult.error || "购物整理失败",
    );
    const products = JSON.parse(shoppingResult.result);
    console.log("Synthetic shopping candidates:", JSON.stringify(products));
    const selectedProducts = products
      .map((candidate: any, index: number) => ({ candidate, index }))
      .filter((x: any) => x.candidate.duplicateOf === undefined);
    assert.equal(selectedProducts.length, 3);
    assert.ok(products.every((c: any) => c.data.listId === list.id));
    await applyDraft(user, {
      operationId: randomUUID(),
      id: shoppingResult.id,
      version: shoppingResult.version,
      selections: selectedProducts,
    });
    assert.equal(
      await db.shoppingItem.count({
        where: { ownerId: user.id, listId: list.id },
      }),
      3,
    );
    report.checks.push({
      name: "真实清单内自由描述拆项并确认",
      passed: true,
      items: 3,
    });
    const chair = await db.shoppingItem.insert({
      data: {
        ownerId: user.id,
        listId: list.id,
        name: "书桌椅",
        budget: 50000,
      },
    });
    const conversion = await db.captureDraft.insert({
      data: {
        ownerId: user.id,
        target: "auto",
        text: "清单里的书桌椅买到了，原计划500元，换了便宜款，优惠前220元，用券20元，实付200元。帮我记账、建物品档案并记录降级省钱。",
        capturedAt: new Date(),
      },
    });
    await processWithOneRetry(conversion.id);
    const conversionResult = await db.captureDraft.require({
      where: { id: conversion.id },
    });
    assert.equal(
      conversionResult.state,
      "ready",
      conversionResult.error || "跨模块整理失败",
    );
    const operations = JSON.parse(conversionResult.result);
    const selectedOperation = operations.findIndex(
      (c: any) => c.target === "conversion" && c.data.itemId === chair.id,
    );
    assert.ok(selectedOperation >= 0, "未匹配到指定购物物品");
    await applyDraft(user, {
      operationId: randomUUID(),
      id: conversion.id,
      version: conversionResult.version,
      selections: [
        { index: selectedOperation, candidate: operations[selectedOperation] },
      ],
    });
    assert.equal(
      (await db.shoppingItem.require({ where: { id: chair.id } }))
        .status,
      "purchased",
    );
    report.checks.push({
      name: "真实自然语言匹配已有购物项并确认跨模块转换",
      passed: true,
    });
    const analysis = await analyze(user, {
      filter: { start: "2026-11-01", end: "2026-11-30" },
    });
    assert.ok(analysis.content.length > 0);
    report.checks.push({ name: "真实统计汇总 AI 分析", passed: true });
  } finally {
    const models = [
      "attachment",
      "captureDraft",
      "usageLog",
      "ownedItem",
      "shoppingItem",
      "shoppingList",
      "savingEntry",
      "ledgerEntry",
      "appliedOperation",
      "aiAnalysis",
    ];
    for (const model of models)
      await (db as any)[model].removeAll({ where: { ownerId: user.id } });
    await db.user.remove({ where: { id: user.id } });
    await mkdir("docs", { recursive: true });
    await writeFile(
      "docs/AI_VERIFICATION.json",
      JSON.stringify(report, null, 2),
    );
  }
  console.log(JSON.stringify(report, null, 2));
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "AI verification failed",
    );
    process.exitCode = 1;
  })
  .finally(() => Promise.resolve());
