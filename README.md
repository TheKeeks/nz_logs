# TheKeeks' NZ Adventure - Travel Blog

A nostalgic Web 1.0-style personal travel diary for a New Zealand trip. Built with vanilla HTML, CSS, and JS — no frameworks, no build tools. Hosted on GitHub Pages.

## Features

- Windows 98 / classic Web 1.0 aesthetic
- Rolling diary of posts (text + Instagram photo embeds)
- In-browser admin panel for publishing (no local editing needed)
- Posts stored in `posts.json`, committed via GitHub API
- Guestbook powered by Giscus (GitHub Discussions)
- Hit counter via hits.seeyoufarm.com
- Scrolling `<marquee>` status message

## Setup Instructions

### 1. Enable GitHub Pages

- Go to **Settings > Pages** on this repo
- Set source to **Deploy from a branch**
- Select the `main` branch and `/ (root)` folder
- Save — your site will be live at `https://thekeeks.github.io/nz_logs/`

### 2. Enable GitHub Discussions

- Go to **Settings > General** on this repo
- Scroll to **Features** and check **Discussions**

### 3. Set Up Giscus (Guestbook)

1. Install the [Giscus app](https://github.com/apps/giscus) on this repo
2. Go to [giscus.app](https://giscus.app/) and configure:
   - **Repository:** `thekeeks/nz_logs`
   - **Category:** Create a "Guestbook" category in Discussions first
   - **Mapping:** `pathname`
3. Copy the generated `data-repo-id` and `data-category-id` values
4. Update the Giscus `<script>` tag in `index.html` with your values:
   - Replace `YOUR_REPO_ID` with your actual repo ID
   - Replace `YOUR_CATEGORY_ID` with your actual category ID

### 4. Create a GitHub Personal Access Token

1. Go to [GitHub Settings > Developer Settings > Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. Create a new token with:
   - **Repository access:** Only select `thekeeks/nz_logs`
   - **Permissions:** Contents → Read and write
3. Copy the generated token

### 5. Configure the Admin Panel

1. Open `js/admin.js`
2. Replace `YOUR_PAT_HERE` in the CONFIG with your GitHub PAT:
   ```js
   githubToken: "github_pat_xxxxxxxxxxxx",
   ```
3. Commit and push this change

> **Security note:** The PAT is stored in client-side JS. Use a fine-grained token scoped only to this repo's contents. The admin page URL (`/admin.html`) is not linked publicly — keep it private. The page is also password-protected.

### 6. Admin Password

The admin panel is protected by password. The default password is pre-configured.

To change the password:
1. Generate a SHA-256 hash of your new password (e.g. using `echo -n "yourpassword" | sha256sum`)
2. Update the `passwordHash` value in `js/admin.js`

### 7. Instagram Handle

The Instagram sidebar embed uses the handle `nz_logs`. To change it:
1. Update the `instagramHandle` in `js/main.js`
2. Update the iframe `src` in `index.html` sidebar

### 8. Start Posting

1. Navigate to `https://thekeeks.github.io/nz_logs/admin.html`
2. Enter the admin password
3. Fill in the post form and click **Publish Post**
4. The site will update automatically in ~30 seconds

## File Structure

```
/
├── index.html        ← Main public journal page
├── admin.html        ← Password-protected post editor
├── posts.json        ← All posts data (append-only)
├── css/
│   └── style.css     ← Windows 98 / Web 1.0 styles
├── js/
│   ├── main.js       ← Post rendering for index.html
│   ├── admin.js      ← Post editor + GitHub API
│   └── instagram.js  ← Instagram oEmbed helper
├── assets/           ← Optional retro graphics
└── README.md
```

## How Publishing Works

1. Author fills in the post form on `admin.html`
2. JS fetches the current `posts.json` via GitHub Contents API
3. New post is prepended to the posts array
4. Updated `posts.json` is committed back to the repo via GitHub API
5. GitHub Pages automatically rebuilds (~30 seconds)
6. Visitors see the new post on `index.html`

## Tech Stack

- **Hosting:** GitHub Pages (free, static)
- **Languages:** Vanilla HTML + CSS + JS only
- **Data:** `posts.json` flat file in the repo
- **Publishing:** GitHub Contents API (browser-side commits)
- **Comments:** Giscus (GitHub Discussions)
- **Analytics:** hits.seeyoufarm.com hit counter
- **Photos:** Instagram oEmbed API
