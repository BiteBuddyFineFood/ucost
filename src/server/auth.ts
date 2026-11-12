import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";

const hashToken = (s: string) => createHash("sha256").update(s).digest("hex");
export async function currentUser() {
  const token = (await cookies()).get("ucost_session")?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return db.user.findUnique({ where: { id: session.userId } });
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("请先登录");
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });
  (await cookies()).set("ucost_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL || "").startsWith("https:"),
    path: "/",
    maxAge: 30 * 86400,
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get("ucost_session")?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete("ucost_session");
}
export async function register(username: string, password: string) {
  if (!/^[\p{L}\p{N}_@.\-]{2,40}$/u.test(username))
    throw new Error("用户名需为 2–40 位文字、数字或 _@.-");
  if (password.length < 8 || password.length > 100)
    throw new Error("密码长度为 8–100 位");
  const passwordHash = await bcrypt.hash(password, 12);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { username, passwordHash } });
    await tx.account.createMany({
      data: ["现金", "银行卡"].map((name) => ({ ownerId: user.id, name })),
    });
    await tx.category.createMany({
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
    await tx.shoppingList.create({
      data: { ownerId: user.id, name: "日常购物" },
    });
    return user;
  });
}
export async function login(username: string, password: string) {
  const user = await db.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    throw new Error("用户名或密码不正确");
  return user;
}
const attempts = new Map<string, { count: number; until: number }>();
export function limitLogin(key: string) {
  const now = Date.now();
  const previous = attempts.get(key);
  if (previous && previous.until > now && previous.count >= 15)
    throw new Error("尝试过于频繁，请 15 分钟后再试");
  attempts.set(key, {
    count: previous && previous.until > now ? previous.count + 1 : 1,
    until: previous && previous.until > now ? previous.until : now + 900000,
  });
  if (attempts.size > 10000)
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
}
