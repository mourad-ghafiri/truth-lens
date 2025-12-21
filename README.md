# 🔍 Truth Lens - AI Fact Checker

👋 **Welcome to Truth Lens!** Your friendly, AI-powered companion for navigating the web with confidence.

Truth Lens helps you instantly verify articles, blog posts, and even YouTube videos right from your browser. Using advanced AI, we analyze claims, detect bias, and provide a clear, easy-to-read report so you can trust what you read (and watch!).

---

## ✨ Features

- ** Instant Fact-Checking:** Analyze any webpage content with a single click.
- **📺 YouTube Support:** We can read transcripts! Fact-check video content without watching the whole thing.
- **🚫 Bias Detection:** Identify political or emotional bias in the text.
- **📝 Summary & Verdict:** Get a quick "Truth Score" and a summary of key points.
- **🌍 Multilingual:** Supports multiple languages including English, Arabic, Chinese, and more.
- **💾 History:** Automatically saves your checks so you can revisit them later.
- **⚙️ Customizable:** Bring your own AI model via OpenRouter.

---

## 📸 A Quick Tour

### 1. Ready to Check
Open the side panel to see the clean, simple interface ready for action.
![Home Page](screnshoots/home_page.jpg)

### 2. Deep Analysis
Watch as Truth Lens extracts content and analyzes it in real-time.
![Analysis in Progress](screnshoots/analysis.jpg)

### 3. Clear Reports
Get a detailed breakdown of claims, with a trust score and referenced sources.
![Report Summary](screnshoots/report_summary.jpg)

### 4. History Tracking
Keep track of everything you've verified in one place.
![History](screnshoots/history.jpg)

### 5. Flexible Settings
Configure your own API keys and preferered languages.
![Settings](screnshoots/settings.jpg)

---

## 🚀 How to Install

Since this is a developer version, you can install it manually in Chrome (or Edge/Brave):

1.  **Download/Clone** this repository to your computer.
2.  Open your browser and navigate to the **Extensions** page:
    *   Chrome: `chrome://extensions`
    *   Edge: `edge://extensions`
3.  Enable **Developer mode** (usually a toggle in the top right corner).
4.  Click **"Load unpacked"**.
5.  Select the folder where you saved this project (`FactChecker`).
6.  🎉 That's it! You should see the Truth Lens icon in your toolbar.

---

## 🔑 Setup & Configuration (Free!)

Truth Lens uses **OpenRouter** to access powerful AI models. We recommend using a high-quality **free** model to get started!

### Step 1: Get your API Key
1.  Go to [OpenRouter.ai](https://openrouter.ai/).
2.  Sign up or Log in.
3.  Go to your **Keys** settings and generate a new API Key.
4.  Copy the key (it starts with `sk-or-...`).

### Step 2: Configure the Extension
1.  Open the Truth Lens extension in your side panel.
2.  Click the **Settings (Gear)** icon in the top/bottom corner.
3.  Enter the settings:
    *   **API Key**: Paste your OpenRouter key here.
    *   **Model**: Enter `nex-agi/deepseek-v3.1-nex-n1:free`
    *   *(This is a great free model, but you can use any OpenRouter model you like!)*
4.  Click **Save**.

✅ **You are now ready to fact-check the internet for free!**

---

## 🛠️ Tech Stack

Built with ❤️ using:
*   **Vanilla JavaScript** (No heavy frameworks!)
*   **Chrome Extensions Manifest V3**
*   **OpenRouter API** for LLM intelligence
*   **CSS Variables** for easy theming

---

*Enjoy browsing deeper with Truth Lens! 🕵️‍♂️*
