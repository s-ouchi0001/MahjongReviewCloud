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

type ReviewProfile = {
  user_id: string;
  email: string;
  is_admin: boolean;
};

type ReviewAssignment = {
  round_id: string;
  reviewer_id: string;
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

function RoundList({ onSelect, isAdmin, onAdmin }: { onSelect: (round: ReviewRound) => void; isAdmin: boolean; onAdmin: () => void }) {
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
    <main className="wrap listWrap">
      <header className="topBar">
        <div>
          <h1>学習データ確認</h1>
          <p>未確認の局面から順に確認してください。</p>
        </div>
        <div className="topActions">
          {isAdmin && <button onClick={onAdmin}>管理画面</button>}
          <button onClick={() => supabase.auth.signOut()}>ログアウト</button>
        </div>
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
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [riverVisibility, setRiverVisibility] = useState<Record<string, boolean>>({
    top_discard: true,
    right_discard: true,
    bottom_discard: true,
    left_discard: true,
  });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [showConfirmedNumbers, setShowConfirmedNumbers] = useState(true);
  const [roundMeta, setRoundMeta] = useState<Partial<ReviewRound> | null>(null);
  const [manualPoint, setManualPoint] = useState<{ x: number; y: number } | null>(null);
  const [manualLabel, setManualLabel] = useState('ignore');
  const [manualSeat, setManualSeat] = useState('bottom');
  const [manualArea, setManualArea] = useState('hand');

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
    if (filterMode === 'pending' && detection.status !== 'pending') return false;
    if (filterMode === 'confirmed' && detection.status === 'pending') return false;
    if (detection.roi_id.endsWith('_discard') && !riverVisibility[detection.roi_id]) return false;
    return true;
  });
  const pending = detections.filter((item) => item.status === 'pending');
  const judged = detections.filter((item) => item.status !== 'pending');
  const guide = guideParts(roundMeta?.guide_rect ?? round.guide_rect);

  function chooseManualPoint(event: React.MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, 1 - ((event.clientY - bounds.top) / bounds.height)));
    setManualPoint(guide ? {
      x: Math.min(1, Math.max(0, guide.x + x * guide.w)),
      y: Math.min(1, Math.max(0, guide.y + y * guide.h)),
    } : { x, y });
  }

  async function addManualDetection() {
    if (!manualPoint) return;
    const nextIndex = detections.reduce((max, item) => Math.max(max, item.detection_index), -1) + 1;
    const roiId = `${manualSeat}_${manualArea}`;
    const names: Record<string, string> = {
      top: '上',
      right: '右',
      bottom: '下',
      left: '左',
      hand: '手牌',
      meld: '副露',
      discard: '河',
    };
    const rect = [
      [Math.max(0, manualPoint.x - 0.012), Math.max(0, manualPoint.y - 0.018)],
      [0.024, 0.036],
    ];
    const { error } = await supabase.from('review_detections').insert({
      round_id: round.id,
      detection_index: nextIndex,
      roi_id: roiId,
      roi_name: `${names[manualSeat]}${names[manualArea]}`,
      label: manualLabel,
      confidence: 1,
      rect,
      status: manualLabel === 'ignore' ? 'corrected' : 'pending',
      corrected_label: manualLabel === 'ignore' ? 'ignore' : null,
      raw_detection: { manual: true },
    });
    if (!error) {
      setManualPoint(null);
      await loadDetail();
    } else {
      alert(`追加できませんでした: ${error.message}`);
    }
  }

  return (
    <main className="wrap detailWrap">
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
            <div className="imageCanvas" onClick={chooseManualPoint}>
              <img
                className="sceneImage"
                src={imageUrl}
                alt="局面画像"
                style={guide ? {
                  position: 'absolute',
                  width: `${100 / guide.w}%`,
                  height: `${100 / guide.h}%`,
                  left: `${-guide.x / guide.w * 100}%`,
                  top: `${-(1 - guide.y - guide.h) / guide.h * 100}%`,
                  maxHeight: 'none',
                  objectFit: 'fill',
                } : undefined}
              />
              {manualPoint && (
                <div
                  className="manualMarker"
                  style={{
                    left: `${((guide ? (manualPoint.x - guide.x) / guide.w : manualPoint.x) * 100)}%`,
                    top: `${((1 - (guide ? (manualPoint.y - guide.y) / guide.h : manualPoint.y)) * 100)}%`,
                  }}
                />
              )}
              <div className="overlay">
                {visibleDetections.map((detection, index) => {
                  const baseRect = rectParts(detection.rect);
                  const rect = guide ? rectInGuide(baseRect, guide) : baseRect;
                  if (rect.w <= 0 || rect.h <= 0) return null;
                  return (
                    <div
                      key={detection.id}
                      className={`box ${detection.status} ${detection.status !== 'pending' && !showConfirmedNumbers ? 'muted' : ''} ${focusedId === detection.id ? 'focused' : ''}`}
                      style={{
                        left: `${rect.x * 100}%`,
                        top: `${(1 - rect.y - rect.h) * 100}%`,
                        width: `${rect.w * 100}%`,
                        height: `${rect.h * 100}%`,
                        zIndex: focusedId === detection.id ? 20000 : 10000 - index,
                      }}
                    >
                      {(detection.status === 'pending' || showConfirmedNumbers) && <span>#{detection.detection_index + 1}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : <div className="empty">画像なし</div>}
        </div>
        <div className="manualAdd">
          <b>未検出追加</b>
          <span>{manualPoint ? '位置選択済み' : '画像をクリック'}</span>
          <select value={manualLabel} onChange={(event) => setManualLabel(event.target.value)}>
            <option value="ignore">対象外</option>
            {tileOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={manualSeat} onChange={(event) => setManualSeat(event.target.value)}>
            <option value="top">上</option>
            <option value="right">右</option>
            <option value="bottom">下</option>
            <option value="left">左</option>
          </select>
          <select value={manualArea} onChange={(event) => setManualArea(event.target.value)}>
            <option value="hand">手牌</option>
            <option value="meld">副露</option>
            <option value="discard">河</option>
          </select>
          <button disabled={!manualPoint} onClick={addManualDetection}>{manualPoint ? '追加' : '未選択'}</button>
        </div>
        <div className="toggles">
          <button className={filterMode === 'all' ? 'active' : ''} onClick={() => setFilterMode('all')}>全て</button>
          <button className={filterMode === 'pending' ? 'active' : ''} onClick={() => setFilterMode('pending')}>未確認</button>
          <button className={filterMode === 'confirmed' ? 'active' : ''} onClick={() => setFilterMode('confirmed')}>確認済</button>
          <button className={!showConfirmedNumbers ? 'active' : ''} onClick={() => setShowConfirmedNumbers((value) => !value)}>
            {showConfirmedNumbers ? '番号なし' : '番号あり'}
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
      {filterMode !== 'confirmed' && pending.length > 0 && <DetectionList title="未確認" detections={pending} updateDetection={updateDetection} focusDetection={setFocusedId} />}
      {filterMode !== 'pending' && judged.length > 0 && <DetectionList title="確認済み" detections={judged} updateDetection={updateDetection} focusDetection={setFocusedId} />}
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

function AdminPage({ onBack }: { onBack: () => void }) {
  const [rounds, setRounds] = useState<ReviewRound[]>([]);
  const [profiles, setProfiles] = useState<ReviewProfile[]>([]);
  const [assignments, setAssignments] = useState<ReviewAssignment[]>([]);
  const [selectedReviewer, setSelectedReviewer] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadAdmin() {
    setLoading(true);
    const [roundResult, profileResult, assignmentResult] = await Promise.all([
      supabase.from('review_round_stats').select('*').order('captured_at', { ascending: false }),
      supabase.from('review_profiles').select('user_id,email,is_admin').order('email', { ascending: true }),
      supabase.from('review_assignments').select('round_id,reviewer_id'),
    ]);

    if (roundResult.error || profileResult.error || assignmentResult.error) {
      setMessage(`読み込み失敗: ${roundResult.error?.message ?? profileResult.error?.message ?? assignmentResult.error?.message}`);
    } else {
      setMessage('');
      setRounds((roundResult.data ?? []) as ReviewRound[]);
      setProfiles((profileResult.data ?? []) as ReviewProfile[]);
      setAssignments((assignmentResult.data ?? []) as ReviewAssignment[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAdmin();
  }, []);

  const reviewers = profiles.filter((profile) => !profile.is_admin);
  const completedRounds = rounds.filter((round) => (round.pending_count ?? 0) === 0).length;
  const assignedRoundIds = new Set(assignments.map((assignment) => assignment.round_id));
  const assignedRoundCount = rounds.filter((round) => assignedRoundIds.has(round.id)).length;
  const filteredRounds = rounds.filter((round) => {
    const assigned = assignedRoundIds.has(round.id);
    if (assignmentFilter === 'assigned') return assigned;
    if (assignmentFilter === 'unassigned') return !assigned;
    return true;
  });

  function assignedEmails(roundId: string) {
    const ids = assignments.filter((assignment) => assignment.round_id === roundId).map((assignment) => assignment.reviewer_id);
    const emails = ids
      .map((id) => profiles.find((profile) => profile.user_id === id)?.email)
      .filter(Boolean);
    return emails.length ? emails.join(', ') : '未割当';
  }

  function workerStats(profile: ReviewProfile) {
    const assignedRoundIdsForWorker = new Set(
      assignments
        .filter((assignment) => assignment.reviewer_id === profile.user_id)
        .map((assignment) => assignment.round_id),
    );
    const assignedRounds = rounds.filter((round) => assignedRoundIdsForWorker.has(round.id));
    const completed = assignedRounds.filter((round) => (round.pending_count ?? 0) === 0).length;
    const totalTiles = assignedRounds.reduce((sum, round) => sum + (round.total_count ?? 0), 0);
    const pendingTiles = assignedRounds.reduce((sum, round) => sum + (round.pending_count ?? 0), 0);
    const reviewedTiles = totalTiles - pendingTiles;
    const progress = totalTiles > 0 ? Math.round((reviewedTiles / totalTiles) * 100) : 0;
    return {
      assignedRounds: assignedRounds.length,
      completed,
      incomplete: assignedRounds.length - completed,
      totalTiles,
      reviewedTiles,
      pendingTiles,
      progress,
    };
  }

  async function assignRound(roundId: string, reviewerId: string) {
    if (!reviewerId) {
      setMessage('割当先ユーザーを選んでください。');
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('review_assignments').upsert({
      round_id: roundId,
      reviewer_id: reviewerId,
      assigned_by: userData.user?.id ?? null,
    });
    setMessage(error ? `割当失敗: ${error.message}` : '割当しました。');
    if (!error) await loadAdmin();
  }

  async function clearAssignments(roundId: string) {
    const { error } = await supabase.from('review_assignments').delete().eq('round_id', roundId);
    setMessage(error ? `解除失敗: ${error.message}` : '割当を解除しました。');
    if (!error) await loadAdmin();
  }

  return (
    <main className="wrap adminWrap">
      <header className="topBar">
        <div>
          <h1>管理画面</h1>
          <p>確認画像の割当と作業状況を確認できます。</p>
        </div>
        <div className="topActions">
          <button className="secondary" onClick={onBack}>一覧へ戻る</button>
          <button onClick={() => supabase.auth.signOut()}>ログアウト</button>
        </div>
      </header>

      {message && <div className="empty">{message}</div>}
      <section className="adminStats">
        <b>局面 {rounds.length}件</b>
        <b>割当済 {assignedRoundCount}件</b>
        <b>未割当 {rounds.length - assignedRoundCount}件</b>
        <b>完了 {completedRounds}件</b>
        <b>作業者 {reviewers.length}人</b>
      </section>

      <section className="adminGrid">
        <div className="adminCard">
          <h2>作業者</h2>
          {reviewers.length === 0 && <p>作業者が未登録です。Supabaseのauth.usersからreview_profilesへ追加してください。</p>}
          {reviewers.map((profile) => {
            const stats = workerStats(profile);
            return (
              <div className="adminRow workerProgress" key={profile.user_id}>
                <div className="workerProgressHead">
                  <b>{profile.email}</b>
                  <span>{stats.progress}%</span>
                </div>
                <div className="progressBar" aria-label={`作業進捗 ${stats.progress}%`}>
                  <span style={{ width: `${stats.progress}%` }} />
                </div>
                <div className="workerProgressGrid">
                  <span>割当 {stats.assignedRounds}件</span>
                  <span>完了 {stats.completed}件</span>
                  <span>未完了 {stats.incomplete}件</span>
                  <span>牌 {stats.reviewedTiles}/{stats.totalTiles}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="adminCard">
          <h2>確認画像の割当</h2>
          <div className="assignControls">
            <select value={selectedReviewer} onChange={(event) => setSelectedReviewer(event.target.value)}>
              <option value="">割当先を選択</option>
              {reviewers.map((profile) => (
                <option key={profile.user_id} value={profile.user_id}>{profile.email}</option>
              ))}
            </select>
            <select value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value as 'all' | 'assigned' | 'unassigned')}>
              <option value="all">全て表示</option>
              <option value="unassigned">未割当のみ</option>
              <option value="assigned">割当済みのみ</option>
            </select>
            <button onClick={loadAdmin}>更新</button>
          </div>

          <div className="adminList">
            {loading && <div className="empty">読み込み中...</div>}
            {!loading && filteredRounds.length === 0 && <div className="empty">対象の確認画像はありません</div>}
            {!loading && filteredRounds.map((round) => (
              <article className="adminRound" key={round.id}>
                <div>
                  <div className="adminRoundTitle">
                    <b>{round.round_before}</b>
                    <span className={assignedRoundIds.has(round.id) ? 'assignBadge assigned' : 'assignBadge unassigned'}>
                      {assignedRoundIds.has(round.id) ? '割当済み' : '未割当'}
                    </span>
                  </div>
                  <span>{round.result_text}</span>
                  <small>
                    {(round.total_count ?? 0) - (round.pending_count ?? 0)}/{round.total_count ?? 0} 確認済み / {accuracyText(round)}
                  </small>
                  <small>割当: {assignedEmails(round.id)}</small>
                </div>
                <div className="adminRoundActions">
                  <button onClick={() => assignRound(round.id, selectedReviewer)}>割当</button>
                  <button className="secondary" onClick={() => clearAssignments(round.id)}>解除</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [selectedRound, setSelectedRound] = useState<ReviewRound | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  async function loadProfile(nextSession: Session | null) {
    if (!nextSession?.user) {
      setIsAdmin(false);
      return;
    }
    const { data } = await supabase
      .from('review_profiles')
      .select('is_admin')
      .eq('user_id', nextSession.user.id)
      .maybeSingle();
    setIsAdmin(data?.is_admin === true);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadProfile(nextSession);
      if (!nextSession) {
        setSelectedRound(null);
        setShowAdmin(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!session) return <Login />;
  if (showAdmin && isAdmin) return <AdminPage onBack={() => setShowAdmin(false)} />;
  if (selectedRound) return <RoundDetail round={selectedRound} onBack={() => setSelectedRound(null)} />;
  return <RoundList onSelect={setSelectedRound} isAdmin={isAdmin} onAdmin={() => setShowAdmin(true)} />;
}

createRoot(document.getElementById('root')!).render(<App />);
