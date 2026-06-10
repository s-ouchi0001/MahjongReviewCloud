# MahjongReviewCloud

Macアプリとは別プロジェクトの、外注確認用Webアプリです。

Macアプリで保存した学習データをSupabaseへアップロードし、外注さんがブラウザで正誤修正できます。

## できること

- 外注さんのログイン
- 学習データ一覧
- 局面画像の確認
- 牌ごとの `正しい` / `修正` / `未確認へ戻す`
- 正答率表示
- 確認済み非表示
- 河の表示ON/OFF
- 修正者と修正日時の保存

## 必要なもの

- Supabaseプロジェクト
- Vercelプロジェクト
- Node.js

## Supabase準備

1. Supabaseで新規プロジェクトを作る
2. SQL Editorで `supabase/schema.sql` を実行する
3. Authenticationで外注さん用ユーザーを作る
4. Project Settingsで以下を控える
   - Project URL
   - anon key
   - service role key

## 手元の設定

`.env.example` を `.env` にコピーして値を入れます。

```bash
cd MahjongReviewCloud
cp .env.example .env
```

`.env` の例:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TRAINING_DIR=/Users/user/Documents/MacMahjongProbeTraining
```

`SUPABASE_SERVICE_ROLE_KEY` は外に出さないでください。Vercelにも入れない運用で始めます。

## 学習データをアップロード

```bash
npm install
npm run upload
```

画像はSupabase Storageの `training-images` に入り、局面と牌ごとの情報はDBに入ります。

## ローカル確認

```bash
npm run dev
```

表示されたURLを開いて、Supabase Authで作った外注者アカウントでログインします。

## Vercel公開

Vercelにこの `MahjongReviewCloud` フォルダを公開します。

Vercel側の環境変数:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` はVercelに入れません。アップロードは手元で行います。

## 最小版の運用

1. Macアプリで学習データを保存
2. `npm run upload` でクラウドへ送る
3. 外注さんがVercelのURLへログイン
4. 未確認の牌を修正
5. Supabaseに修正結果が残る

## 次に伸ばす候補

- Macアプリから直接アップロード
- 外注者ごとの作業数・正答率
- 二重チェック
- 不一致だけ管理者が確認
- 再学習用CSV/JSONの出力
