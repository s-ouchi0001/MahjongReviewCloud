import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

async function loadDotEnv() {
  let text = '';
  try {
    text = await readFile(path.resolve('.env'), 'utf8');
  } catch {
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

await loadDotEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const trainingDir = process.env.TRAINING_DIR || '/Users/user/Documents/MacMahjongProbeTraining';

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('VITE_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function normalizeTile(label) {
  const value = String(label || '').trim().toLowerCase();
  const map = {
    east: '1z', '東': '1z',
    south: '2z', '南': '2z',
    west: '3z', '西': '3z',
    north: '4z', '北': '4z',
    white: '5z', '白': '5z',
    green: '6z', '發': '6z', '発': '6z',
    red: '7z', '中': '7z',
  };
  return map[value] || value;
}

function storageImagePath(id) {
  const hash = createHash('sha1').update(id).digest('hex').slice(0, 12);
  const safe = id.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return `rounds/${hash}_${safe || 'round'}.png`;
}

async function uploadOne(jsonFile) {
  const id = path.basename(jsonFile, '.json');
  const jsonPath = path.join(trainingDir, jsonFile);
  const snapshot = JSON.parse(await readFile(jsonPath, 'utf8'));
  const roundId = snapshot.id || id;
  const pngFile = snapshot.frameImage || `${id}.png`;
  const pngPath = path.join(trainingDir, pngFile);

  let imagePath = null;
  try {
    const image = await readFile(pngPath);
    const uploadPath = storageImagePath(roundId);
    const { error } = await supabase.storage
      .from('training-images')
      .upload(uploadPath, image, {
        contentType: 'image/png',
        upsert: true,
      });
    if (error) throw error;
    imagePath = uploadPath;
  } catch (error) {
    console.warn(`画像アップロード失敗: ${pngFile}`);
    console.warn(error?.message || error);
  }

  const { error: roundError } = await supabase.from('review_rounds').upsert({
    id: roundId,
    captured_at: snapshot.capturedAt,
    event: snapshot.event || 'unknown',
    round_before: snapshot.roundBefore || '',
    round_after: snapshot.roundAfter || null,
    honba: snapshot.honba || 0,
    kyotaku: snapshot.kyotaku || 0,
    result_text: snapshot.resultText || '',
    image_path: imagePath,
    guide_rect: snapshot.guideRect || null,
    raw_snapshot: snapshot,
  });
  if (roundError) throw roundError;

  const detections = (snapshot.detections || []).map((detection, index) => {
    let status = 'pending';
    let correctedLabel = null;
    if (detection.accepted === true) {
      status = 'correct';
    } else if (detection.accepted === false || detection.correctedLabel) {
      status = 'corrected';
      correctedLabel = normalizeTile(detection.correctedLabel || detection.label);
    }
    return {
      round_id: roundId,
      detection_index: index,
      roi_id: detection.roiId || '',
      roi_name: detection.roiName || '',
      label: normalizeTile(detection.label || ''),
      confidence: detection.confidence || 0,
      rect: detection.rect,
      status,
      corrected_label: correctedLabel,
      raw_detection: detection,
    };
  });

  if (detections.length > 0) {
    const { error: detectionError } = await supabase
      .from('review_detections')
      .upsert(detections, { onConflict: 'round_id,detection_index' });
    if (detectionError) throw detectionError;
  }

  console.log(`uploaded: ${roundId} (${detections.length} detections) image=${imagePath ? 'ok' : 'none'}`);
}

const files = (await readdir(trainingDir)).filter((file) => file.endsWith('.json')).sort();
for (const file of files) {
  await uploadOne(file);
}

console.log(`done: ${files.length} rounds`);
