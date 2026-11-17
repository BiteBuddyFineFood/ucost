// Deterministic local integration fixture. Never configured by wrangler.jsonc.
const fixture = {
  async fetch(request) {
    if (new URL(request.url).pathname === "/health") return new Response("ok");
    const input = await request.json();
    const content = input.messages?.[1]?.content;
    const payload = JSON.parse(typeof content === "string" ? content : content[0].text);
    if (payload.text?.includes("stub-fail")) return new Response("fixture failure", { status: 503 });
    const result = { candidates: [{ target: payload.target === "auto" ? "ledger" : payload.target,
      data: { type: "expense", title: "截图识别候选", amount: 2800, date: payload.capturedDate, discount: 0 }, warnings: [] }], warnings: [] };
    return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] });
  },
};
export default fixture;
