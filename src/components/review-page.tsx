"use client";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { api, Busy, Empty } from "./ui";
import { money, reviewStates } from "@/lib/domain";
export default function ReviewPage({ token }: { token: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [approve, setApprove] = useState(true),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setData(await api(`review/${token}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  if (!data)
    return (
      <main className="share-page">
        <Link className="brand" href="/">
          <BookOpen />
          UCost
        </Link>
        {error ? <Empty title="这页暂时打不开" text={error} /> : <Busy />}
      </main>
    );
  const { review, votes, user } = data;
  return (
    <main className="share-page">
      <Link className="brand" href="/">
        <BookOpen />
        UCost <small>购物评议</small>
      </Link>
      <article className="panel share-card">
        <span className="pill">{reviewStates[review.status]}</span>
        <h1>{review.title}</h1>
        <div className="share-item">
          <h2>{review.info.name}</h2>
          {review.info.budget != null && (
            <strong>预算 ¥{money(review.info.budget)}</strong>
          )}
          <p>{review.info.reason}</p>
        </div>
        <p className="prewrap">{review.description || "想听听大家的看法。"}</p>
        <div className="review-progress">
          <span>
            {votes.length} / {review.targetCount} 人已评议
          </span>
          <b>{review.rule === "all" ? "需要全员赞成" : "需要严格过半赞成"}</b>
        </div>
        <progress max={review.targetCount} value={votes.length} />
        <section className="vote-list">
          {votes.map((v: any) => (
            <div className="vote" key={v.id}>
              {v.approve ? <ThumbsUp size={18} /> : <ThumbsDown size={18} />}
              <div>
                <b>
                  {v.username}
                  {v.isMine && "（我）"} · {v.approve ? "赞成" : "反对"}
                </b>
                <p>{v.comment || "没有附加评语"}</p>
              </div>
            </div>
          ))}
        </section>
        {review.status === "open" &&
          !review.isOwner &&
          (user ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api(`review/${token}`, {
                    operationId: crypto.randomUUID(),
                    approve,
                    comment,
                  });
                  await refresh();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>
                {votes.some((v: any) => v.isMine)
                  ? "修改我的意见"
                  : "说说你的看法"}
              </h2>
              <div className="tabs">
                <button
                  type="button"
                  className={approve ? "selected" : ""}
                  onClick={() => setApprove(true)}
                >
                  <ThumbsUp size={16} />
                  赞成
                </button>
                <button
                  type="button"
                  className={!approve ? "selected" : ""}
                  onClick={() => setApprove(false)}
                >
                  <ThumbsDown size={16} />
                  反对
                </button>
              </div>
              <label className="field">
                <span>评语</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="为什么这样想？"
                />
              </label>
              <button
                type="button"
                className="text-button"
                disabled={busy || !comment || !user?.aiAllowed}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const result = await api("polish", { text: comment });
                    setComment(result.text);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                AI 整理评语
              </button>
              <button className="button" disabled={busy}>
                {busy ? <Busy /> : "保存我的意见"}
              </button>
            </form>
          ) : (
            <p>
              <a className="button" href="/" target="_blank">
                登录后参与
              </a>{" "}
              登录后回到本页刷新即可。
            </p>
          ))}
        {review.isOwner && <p className="hint">你是发起者，不计入评议人数。</p>}
        {error && <p className="error">{error}</p>}
      </article>
      <p className="hint">评议只表达购买意见，通过后不会自动购买或记账。</p>
    </main>
  );
}
