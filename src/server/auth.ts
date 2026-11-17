import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, database, writeBatch } from "./db";
import { setting } from "./environment";
import { redeemInvite } from "./invites";

const hashToken = (s: string) => createHash("sha256").update(s).digest("hex");
export async function currentUser() {
  const token = (await cookies()).get("ucost_session")?.value;
  if (!token) return null;
  const session = await db.session.first({
    where: { id: hashToken(token) },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return db.user.first({ where: { id: session.userId } });
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("请先登录");
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.session.insert({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });
  (await cookies()).set("ucost_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: setting("APP_URL").startsWith("https:"),
    path: "/",
    maxAge: 30 * 86400,
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get("ucost_session")?.value;
  if (token) await db.session.removeAll({ where: { id: hashToken(token) } });
  jar.delete("ucost_session");
}
export async function register(
  username: string,
  password: string,
  inviteCode = "",
) {
  if (!/^[\p{L}\p{N}_@.\-]{2,40}$/u.test(username))
    throw new Error("用户名需为 2–40 位文字、数字或 _@.-");
  if (password.length < 8 || password.length > 100)
    throw new Error("密码长度为 8–100 位");
  const passwordHash = await bcrypt.hash(password, 12);
  return writeBatch(async (tx) => {
    const user = await tx.user.insert({ data: { username, passwordHash } });
    if (inviteCode.trim()) await redeemInvite(tx, inviteCode, user.id);
    await tx.account.insertAll({
      data: ["现金", "银行卡"].map((name) => ({ ownerId: user.id, name })),
    });
    await tx.category.insertAll({
      data: [
        ...["餐饮", "交通", "购物", "居住", "娱乐", "健康", "其他"].map(
          (name) => ({ ownerId: user.id, name, type: "expense" }),
        ),
        ...["工资", "奖金", "其他收入"].map((name) => ({
          ownerId: user.id,
          name,
          type: "income",
        })),
      ],
    });
    await tx.shoppingList.insert({
      data: { ownerId: user.id, name: "日常购物" },
    });
    return user;
  });
}
export async function login(username: string, password: string) {
  const user = await db.user.first({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    throw new Error("用户名或密码不正确");
  return user;
}
export async function limitLogin(key: string) {
  const now = Date.now();
  const d1 = await database();
  const result = await d1.batch([
    d1.prepare('DELETE FROM LoginAttempt WHERE "until" < ?').bind(now),
    d1.prepare('INSERT INTO LoginAttempt(id,count,"until") VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(hashToken(key), now + 900000),
  ]);
  if (Number((result[1].results[0] as any).count) > 15)
    throw new Error("尝试过于频繁，请 15 分钟后再试");
}
