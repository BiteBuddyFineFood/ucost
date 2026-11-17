import { db } from "../src/server/db";
import { register } from "../src/server/auth";
import { localDate } from "../src/lib/domain";

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("演示 seed 不能在生产环境运行");
  const demoPassword = process.env.SEED_PASSWORD;
  if (!demoPassword)
    throw new Error("请设置 SEED_PASSWORD 环境变量后再运行 db:seed");
  for (const username of ["demo", "reviewer1", "reviewer2"]) {
    if (!(await db.user.first({ where: { username } })))
      await register(username, demoPassword);
  }
  const user = await db.user.require({ where: { username: "demo" } });
  if (await db.ledgerEntry.count({ where: { ownerId: user.id } })) {
    console.log("演示账号已有数据，跳过重复填充。");
    return;
  }
  const ownerId = user.id,
    today = localDate(),
    month = today.slice(0, 7);
  const categories = await db.category.list({ where: { ownerId } });
  const account = await db.account.require({
    where: { ownerId, name: "银行卡" },
  });
  const list = await db.shoppingList.require({ where: { ownerId } });
  const rows = [
    {
      title: "十一月工资（演示）",
      type: "income",
      amount: 1280000,
      day: "01",
      category: "工资",
    },
    {
      title: "一周的蔬菜水果（演示）",
      type: "expense",
      amount: 16800,
      day: "03",
      category: "餐饮",
    },
    {
      title: "周末小聚（演示）",
      type: "expense",
      amount: 23600,
      day: "05",
      category: "餐饮",
    },
    {
      title: "通勤地铁（演示）",
      type: "expense",
      amount: 3600,
      day: "06",
      category: "交通",
    },
    {
      title: "日常补给（演示）",
      type: "expense",
      amount: 8900,
      day: "08",
      category: "购物",
    },
    {
      title: "早餐与咖啡（演示）",
      type: "expense",
      amount: 3500,
      day: "10",
      category: "餐饮",
    },
  ];
  for (const row of rows)
    await db.ledgerEntry.insert({
      data: {
        ownerId,
        title: row.title,
        type: row.type,
        amount: row.amount,
        date: `${month}-${row.day}`,
        accountId: account.id,
        categoryId: categories.find((c) => c.name === row.category)?.id,
      },
    });
  await db.shoppingItem.insertAll({
    data: [
      {
        ownerId,
        listId: list.id,
        name: "轻一点的无线吸尘器（演示）",
        budget: 100000,
        reason: "家里有猫，现有的太重",
        requirements: "无线、能进床底",
        concerns: "收纳空间和耗材",
        status: "considering",
      },
      {
        ownerId,
        listId: list.id,
        name: "每周超市补给（演示）",
        quantity: "牛奶 2 盒",
        budget: 5000,
        status: "planned",
      },
    ],
  });
  await db.shoppingList.insert({
    data: {
      ownerId,
      name: "给家的小更新（演示）",
      description: "不着急，慢慢选。",
    },
  });
  await db.ownedItem.insert({
    data: {
      ownerId,
      name: "降噪耳机（演示）",
      price: 120000,
      purchaseDate: `${Number(today.slice(0, 4)) - 1}-06-15`,
      note: "上下班路上的好伙伴",
    },
  });
  await db.savingEntry.insertAll({
    data: [
      {
        ownerId,
        title: "继续用现在的包（演示）",
        type: "skipped",
        source: "manual",
        amount: 39900,
        planned: 39900,
        actual: 0,
        date: today,
      },
      {
        ownerId,
        title: "选择够用的台灯（演示）",
        type: "downgrade",
        source: "manual",
        amount: 12000,
        planned: 29900,
        actual: 17900,
        date: today,
      },
    ],
  });
  console.log(
    "已创建明确标记的演示数据。账号 demo / reviewer1 / reviewer2，密码使用本次 SEED_PASSWORD。",
  );
}
export const seed = main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "seed失败");
    process.exitCode = 1;
  })
  .finally(() => Promise.resolve());
