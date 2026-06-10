import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import './styles.css';

type ReviewRound = {
  id: string;
  captured_at: string;
  round_before: string;
  result_text: string;
  image_path: string | null;
  guide_rect?: unknown;
  total_count: number | null;
  pending_count: number | null;
  correct_count: number | null;
  corrected_count: number | null;
};

type ReviewDetection = {
  id: string;
  detection_index: number;
  roi_id: string;
  roi_name: string;
  label: string;
  confidence: number;
  rect: unknown;
  status: 'pending' | 'correct' | 'corrected';
  corrected_label: string | null;
};

const tileOptions = [
  '1m', '2m', '3m', '4m', '0m', '5m', '6m', '7m', '8m', '9m',
  '1p', '2p', '3p', '4p', '0p', '5p', '6p', '7p', '8p', '9p',
  '1s', '2s', '3s', '4s', '0s', '5s', '6s', '7s', '8s', '9s',
  '1z', '2z', '3z', '4z', '5z', '6z', '7z',
];

function normalizeTile(label: string) {
  switch (label.trim().toLowerCase()) {
    case 'east':
    case '東':
      return '1z';
    case 'south':
    case '南':
      return '2z';
    case 'west':
    case '西':
      return '3z';
    case 'north':
    case '北':
      return '4z';
    case 'white':
    case '白':
      return '5z';
    case 'green':
    case '發':
    case '発':
      return '6z';
    case 'red':
    case '中':
      return '7z';
    default:
      return label.trim().toLowerCase();
  }
}

function rectParts(rect: unknown) {
  if (!rect) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  if (Array.isArray(rect) && Array.isArray(rect[0]) && Array.isArray(rect[1])) {
    return {
      x: Number(rect[0][0]),
      y: Number(rect[0][1]),
      w: Number(rect[1][0]),
      h: Number(rect[1][1]),
    };
  }
  const value = rect as { x?: number; y?: number; width?: number; height?: number };
  return {
    x: Number(value.x ?? 0),
    y: Number(value.y ?? 0),
    w: Number(value.width ?? 0),
    h: Number(value.height ?? 0),
  };
}

function guideParts(rect: unknown) {
  if (Array.isArray(rect) && Array.isArray(rect[0]) && Array.isArray(rect[1])) {
    const x = Number(rect[0][0]);
    const y = Number(rect[0][1]);
    const w = Number(rect[1][0]);
    const h = Number(rect[1][1]);
    if (!w || !h) return null;
    const padX = Math.max(w * 0.06, 0.035);
    const padY = Math.max(h * 0.06, 0.035);
    const x1 = Math.max(0, x - padX);
    const y1 = Math.max(0, y - padY);
    const x2 = Math.min(1, x + w + padX);
    const y2 = Math.min(1, y + h + padY);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  const base = rectParts(rect);
  if (!base.w || !base.h) return null;
  const padX = Math.max(base.w * 0.06, 0.035);
  const padY = Math.max(base.h * 0.06, 0.035);
  const x1 = Math.max(0, base.x - padX);
  const y1 = Math.max(0, base.y - padY);
  const x2 = Math.min(1, base.x + base.w + padX);
  const y2 = Math.min(1, base.y + base.h + padY);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function rectInGuide(rect: { x: number; y: number; w: number; h: number }, guide: { x: number; y: number; w: number; h: number }) {
  const x1 = Math.max(rect.x, guide.x);
  const y1 = Math.max(rect.y, guide.y);
  const x2 = Math.min(rect.x + rect.w, guide.x + guide.w);
  const y2 = Math.min(rect.y + rect.h, guide.y + guide.h);
  return {
    x: (x1 - guide.x) / guide.w,
    y: (y1 - guide.y) / guide.h,
    w: Math.max(0, (x2 - x1) / guide.w),
    h: Math.max(0, (y2 - y1) / guide.h),
  };
}

function isIgnored(detection: ReviewDetection) {
  return detection.corrected_label === 'ignore';
}



function accuracyText(round: ReviewRound) {
  const correct = round.correct_count ?? 0;
  const corrected = round.corrected_count ?? 0;
  const judged = correct + corrected;
  if (judged === 0) return '正答率 --%';
  return `正答率 ${(correct / judged * 100).toFixed(1)}%`;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setMessage('確認中...');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? `ログイン失敗: ${error.message}` : '');
  }

  return (
    <main className="login">
      <h1>麻雀牌 確認画面</h1>
      <form onSubmit={signIn} className="loginBox">
        <label>
          メール
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
        </label>
        <label>
          パスワード
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        <button type="submit">ログイン</button>
        {message && <p>{message}</p>}
      </form>
    </main>
  );
}

function RoundList({ onSelect }: { onSelect: (round: ReviewRound) => void }) {
  const [rounds, setRounds] = useState<ReviewRound[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadRounds() {
    setLoading(true);
    const { data, error } = await supabase
      .from('review_round_stats')
      .select('*')
      .order('captured_at', { ascending: false });
    if (!error) setRounds(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadRounds();
  }, []);

  return (
    <main className="wrap">
      <header className="topBar">
        <div>
          <h1>学習データ確認</h1>
          <p>未確認の局面から順に確認してください。</p>
        </div>
        <button onClick={() => supabase.auth.signOut()}>ログアウト</button>
      </header>
      <div className="roundList">
        {loading && <div className="empty">読み込み中...</div>}
        {!loading && rounds.length === 0 && <div className="empty">学習データがありません</div>}
        {rounds.map((round) => (
          <button key={round.id} className="roundItem" onClick={() => onSelect(round)}>
            <b>{round.round_before}</b>
            <span>{round.result_text}</span>
            <small>
              {(round.total_count ?? 0) - (round.pending_count ?? 0)}/{round.total_count ?? 0} 確認済み / {accuracyText(round)}
            </small>
          </button>
        ))}
      </div>
    </main>
  );
}

function RoundDetail({ round, onBack }: { round: ReviewRound; onBack: () => void }) {
  const [detections, setDetections] = useState<ReviewDetection[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hideJudged, setHideJudged] = useState(false);
  const [riverVisibility, setRiverVisibility] = useState<Record<string, boolean>>({
    top_discard: true,
    right_discard: true,
    bottom_discard: true,
    left_discard: true,
  });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [roundMeta, setRoundMeta] = useState<Partial<ReviewRound> | null>(null);

  const stats = useMemo(() => {
    const correct = detections.filter((item) => item.status === 'correct').length;
    const corrected = detections.filter((item) => item.status === 'corrected').length;
    const pending = detections.filter((item) => item.status === 'pending').length;
    const judged = correct + corrected;
    return {
      correct,
      corrected,
      pending,
      accuracy: judged === 0 ? '--%' : `${(correct / judged * 100).toFixed(1)}%`,
    };
  }, [detections]);

  async function loadDetail() {
    const { data: meta } = await supabase
      .from('review_rounds')
      .select('image_path,guide_rect')
      .eq('id', round.id)
      .single();
    setRoundMeta(meta ?? null);

    const { data } = await supabase
      .from('review_detections')
      .select('*')
      .eq('round_id', round.id)
      .order('roi_name')
      .order('detection_index');
    setDetections(data ?? []);

    const imagePath = meta?.image_path ?? round.image_path;
    if (imagePath) {
      const signed = await supabase.storage.from('training-images').createSignedUrl(imagePath, 60 * 60);
      setImageUrl(signed.data?.signedUrl ?? null);
    } else {
      setImageUrl(null);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [round.id]);

  async function updateDetection(detection: ReviewDetection, status: 'pending' | 'correct' | 'corrected', correctedLabel: string | null) {
    const { data: userData } = await supabase.auth.getUser();
    const reviewed = status === 'pending' ? null : new Date().toISOString();
    const { error } = await supabase
      .from('review_detections')
      .update({
        status,
        corrected_label: correctedLabel,
        reviewer_id: status === 'pending' ? null : userData.user?.id ?? null,
        reviewed_at: reviewed,
      })
      .eq('id', detection.id);
    if (!error) {
      setDetections((items) =>
        items.map((item) =>
          item.id === detection.id
            ? { ...item, status, corrected_label: correctedLabel }
            : item
        )
      );
    }
  }

  const visibleDetections = detections.filter((detection) => {
    if (hideJudged && detection.status !== 'pending') return false;
    if (detection.roi_id.endsWith('_discard') && !riverVisibility[detection.roi_id]) return false;
    return true;
  });
  const pending = detections.filter((item) => item.status === 'pending');
  const judged = detections.filter((item) => item.status !== 'pending');
  const guide = guideParts(roundMeta?.guide_rect ?? round.guide_rect);

  return (
    <main className="wrap">
      <div className="sticky">
        <header className="topBar">
          <button onClick={onBack}>一覧へ戻る</button>
          <div>
            <h1>{round.round_before}</h1>
            <p>{round.result_text}</p>
          </div>
        </header>
        <div className="summary">
          正答率 {stats.accuracy} / 正しい {stats.correct}件 / 修正 {stats.corrected}件 / 未確認 {stats.pending}件
        </div>
        <div className="imageWrap">
          {imageUrl ? (
            <div className="imageCanvas">
              <img
                className="sceneImage"
                src={imageUrl}
                alt="局面画像"
              />
              <div className="overlay">
                {visibleDetections.map((detection, index) => {
                  const baseRect = rectParts(detection.rect);
                  const rect = guide ? rectInGuide(baseRect, guide) : baseRect;
                  if (rect.w <= 0 || rect.h <= 0) return null;
                  return (
                    <div
                      key={detection.id}
                      className={`box ${detection.status} ${focusedId === detection.id ? 'focused' : ''}`}
                      style={{
                        left: `${rect.x * 100}%`,
                        top: `${(1 - rect.y - rect.h) * 100}%`,
                        width: `${rect.w * 100}%`,
                        height: `${rect.h * 100}%`,
                        zIndex: focusedId === detection.id ? 20000 : 10000 - index,
                      }}
                    >
                      <span>#{detection.detection_index + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : <div className="empty">画像なし</div>}
        </div>
        <div className="toggles">
          <button onClick={() => setHideJudged((value) => !value)}>
            {hideJudged ? '確認済みを表示' : '確認済みを非表示'}
          </button>
          {[
            ['top_discard', '上河'],
            ['right_discard', '右河'],
            ['bottom_discard', '下河'],
            ['left_discard', '左河'],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={riverVisibility[key]}
                onChange={(event) => setRiverVisibility((value) => ({ ...value, [key]: event.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <DetectionList title="未確認" detections={pending} updateDetection={updateDetection} focusDetection={setFocusedId} />
      {!hideJudged && <DetectionList title="判断済み" detections={judged} updateDetection={updateDetection} focusDetection={setFocusedId} />}
    </main>
  );
}

function DetectionList({
  title,
  detections,
  updateDetection,
  focusDetection,
}: {
  title: string;
  detections: ReviewDetection[];
  updateDetection: (detection: ReviewDetection, status: 'pending' | 'correct' | 'corrected', correctedLabel: string | null) => void;
  focusDetection: (id: string) => void;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <div className="detections">
        {detections.length === 0 && <div className="empty">ありません</div>}
        {detections.map((detection) => (
          <DetectionRow key={detection.id} detection={detection} updateDetection={updateDetection} focusDetection={focusDetection} />
        ))}
      </div>
    </section>
  );
}

function DetectionRow({
  detection,
  updateDetection,
  focusDetection,
}: {
  detection: ReviewDetection;
  updateDetection: (detection: ReviewDetection, status: 'pending' | 'correct' | 'corrected', correctedLabel: string | null) => void;
  focusDetection: (id: string) => void;
}) {
  const [label, setLabel] = useState(normalizeTile(detection.corrected_label ?? detection.label));
  return (
    <article className={`det ${detection.status}`}>
      <div>
        <b>#{detection.detection_index + 1} {detection.roi_name}</b>
        <span>推論: {detection.label} / 信頼度 {detection.confidence.toFixed(2)}</span>
        <small>{detection.status === 'pending' ? '未確認' : detection.status === 'correct' ? '正しい' : isIgnored(detection) ? '対象外' : `修正: ${detection.corrected_label}`}</small>
      </div>
      <div className="actions">
        <button onClick={() => focusDetection(detection.id)}>見る</button>
        <button onClick={() => updateDetection(detection, 'correct', null)}>正しい</button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            updateDetection(detection, 'corrected', label);
          }}
        >
          <select value={label} onChange={(event) => setLabel(event.target.value)}>
            {tileOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button type="submit">修正</button>
        </form>
        <button onClick={() => updateDetection(detection, 'corrected', 'ignore')}>対象外</button>
        <button onClick={() => updateDetection(detection, 'pending', null)}>未確認へ戻す</button>
      </div>
    </article>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [selectedRound, setSelectedRound] = useState<ReviewRound | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setSelectedRound(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!session) return <Login />;
  if (selectedRound) return <RoundDetail round={selectedRound} onBack={() => setSelectedRound(null)} />;
  return <RoundList onSelect={setSelectedRound} />;
}

createRoot(document.getElementById('root')!).render(<App />);
