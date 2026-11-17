import { randomInt } from "node:crypto";
import type { Store } from "./store";

export const DEFAULT_INVITE_LIMIT = 10;
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_PATTERN = /^[A-Z0-9-]{4,32}$/;

export function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function generateInviteCode() {
  const part = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `UC-${part()}-${part()}`;
}

export async function redeemInvite(
  store: Store,
  rawCode: string,
  ownerId: string,
) {
  const code = normalizeInviteCode(rawCode);
  if (!code) return null;
  const existing = await store.inviteRedemption.first({ where: { ownerId } });
  if (existing)
    throw new Error(
      existing.code === code
        ? "邀请码已绑定，无需重复填写"
        : "账号已绑定邀请码，不能更换",
    );
  if (!CODE_PATTERN.test(code)) throw new Error("邀请码格式不正确，请检查后重试");
  const invite = await store.inviteCode.first({ where: { code } });
  if (!invite) throw new Error("邀请码无效，请检查后重试");
  if (invite.disabled) throw new Error("该邀请码已停用");
  const redeemed = await store.inviteRedemption.count({
    where: { codeId: invite.id },
  });
  if (Math.max(invite.usedCount, redeemed) >= invite.maxUses)
    throw new Error("该邀请码绑定人数已满，请联系管理员获取新的邀请码");
  await store.inviteRedemption.insert({
    data: { codeId: invite.id, code: invite.code, ownerId },
  });
  await store.inviteCode.change({
    where: { id: invite.id },
    data: { usedCount: { increment: 1 } },
  });
  return invite;
}

export async function inviteAccess(store: Store, ownerId: string) {
  return store.inviteRedemption.first({ where: { ownerId } });
}

export function inviteRemaining(invite: {
  maxUses: number;
  usedCount: number;
}) {
  return Math.max(0, invite.maxUses - invite.usedCount);
}
