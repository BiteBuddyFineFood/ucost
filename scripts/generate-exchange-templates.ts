import { mkdir, writeFile } from "node:fs/promises";
import { emptyRecords, exportCsv } from "../src/server/exchange-codec";
async function main() {
  await mkdir("public/templates", { recursive: true });
  const data = {
    ...emptyRecords(),
    datasetId: "replace-with-your-stable-dataset-id",
  };
  data.ledger = [
    {
      id: "ledger-001",
      date: "2026-11-12",
      type: "expense",
      title: "示例支出（请替换）",
      amount: 8000,
      discount: 2000,
      grossAmount: 10000,
      autoSaving: false,
      note: "金额均为整数分；导入 CSV 不自动生成优惠省钱。",
    },
  ];
  data.savings = [
    {
      id: "saving-001",
      date: "2026-11-12",
      title: "示例手工省钱（请替换）",
      type: "reduced",
      source: "manual",
      planned: 10000,
      actual: 8000,
      amount: 2000,
      status: "valid",
      suppressed: false,
      note: "复杂来源关系请用 JSON 恢复。",
    },
  ];
  for (const entity of ["ledger", "savings"] as const)
    await writeFile(
      `public/templates/${entity}-v2.csv`,
      exportCsv(data, entity),
    );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
