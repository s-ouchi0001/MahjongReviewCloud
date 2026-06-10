# Vercel公開手順

このフォルダは、外注さんが牌確認をするためのWeb画面です。

## 1. GitHubへ上げる

`MahjongReviewCloud` フォルダをGitHubのリポジトリに入れます。

`.env` はアップロードしません。`.gitignore` に入っています。

## 2. VercelでImport

VercelのDashboardで `New Project` を押し、GitHubのリポジトリを選んでImportします。

設定は基本そのままで大丈夫です。

- Framework: Vite
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

この内容は `vercel.json` にも入っています。

## 3. Environment Variables

VercelのEnvironment Variablesには、この2つだけ入れます。

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` はVercelに入れません。
これはMacからアップロードするときだけ使う強い鍵です。

## 4. Deploy

`Deploy` を押します。

成功すると、外注さんに渡すURLができます。

```text
https://xxxxx.vercel.app
```

外注さんはSupabase Authで作ったメールアドレスとパスワードでログインします。
