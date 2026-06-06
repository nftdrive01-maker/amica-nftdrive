<p align="center">
    <img src="https://amica.arbius.ai/ogp.png" width="600" style="margin-bottom: 0.2;"/>
</p>

> NFTDrive fork repository: https://github.com/nftdrive01-maker/amica-nftdrive
>
> NFTDrive fork of Amica for Ark-i integration, injection-tool connectivity, and domain-based AI operation.
> This repository is maintained by NFTDrive for Ark-i related deployment and operational workflows.
> Default branch for NFTDrive operations: feat-add-injection
> For the original upstream project, see: https://github.com/semperai/amica

<h2 align="center"><a href="https://amica.arbius.ai">Amica: Your friendly personal AI</a></h2>


<h5 align="center"> If you like our project, please give us a star ⭐ on GitHub.</h2>


<h5 align="center">

[![twitter](https://img.shields.io/badge/Twitter%20-black)](https://twitter.com/arbius_ai)
[![License](https://img.shields.io/github/license/nftdrive01-maker/amica-nftdrive)](https://github.com/nftdrive01-maker/amica-nftdrive/blob/feat-add-injection/LICENSE)
[![Hits](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2Fsemperai%2Famica&count_bg=%2379C83D&title_bg=%23555555&icon=&icon_color=%23E7E7E7&title=hits&edge_flat=false)](https://hits.seeyoufarm.com)
[![GitHub issues](https://img.shields.io/github/issues/nftdrive01-maker/amica-nftdrive?color=critical&label=Issues)](https://github.com/nftdrive01-maker/amica-nftdrive/issues?q=is%3Aopen+is%3Aissue)
[![GitHub closed issues](https://img.shields.io/github/issues-closed/nftdrive01-maker/amica-nftdrive?color=success&label=Issues)](https://github.com/nftdrive01-maker/amica-nftdrive/issues?q=is%3Aissue+is%3Aclosed)

</h5>

Amica allows you to converse with highly customizable 3D characters that can communicate via natural voice chat and vision, with an emotion engine that allows Amica to express feelings and more. Customize her any way you want with any AI technology.

[Try Amica here on mobile, tablet or desktop](https://amica.arbius.ai)

> **For Windows Users**: Please create a new folder for Amica during installation to prevent the unintentional deletion of other files during uninstallation.

<p align="center"><a href="https://github.com/flukexp/llama-piper-go/releases/download/v1.0.0/llama-piper-window.exe"><img src="https://img.shields.io/badge/Download%20for%20Windows%20-green?style=for-the-badge&logo=windows" /></a>

We just released Amica 1.2 with lots of new features. [Docs](https://docs.heyamica.com/) will be further updated soon, **watch the video to learn about what Amica 1.2 offers:**

[![Video Title](https://img.youtube.com/vi/3zCN2IlxHrU/0.jpg)](https://www.youtube.com/watch?v=3zCN2IlxHrU)

You can import VRM files, adjust the voice to fit the character, and generate response text that includes emotional expressions.


</p>

The various features of Amica mainly use and support the following technologies:

> To see tutorials on configuring any of these with Amica please visit the [official Amica documentation](https://docs.heyamica.com/).

- 3D Rendering
  - [three.js](https://threejs.org/)
- Displaying 3D characters
  - [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- Running Transformers in the browser
  - [Transformers.js](https://huggingface.co/docs/transformers.js/index)
- Speech recognition
  - [Whisper](https://openai.com/research/whisper)
- Voice Activity Detection
  - [Silero VAD](https://github.com/ricky0123/vad/)
- ChatBot
  - [Llama.cpp server](https://github.com/ggerganov/llama.cpp)
  - [ChatGPT API](https://platform.openai.com/docs/api-reference/chat) (compatible with projects such as [LM Studio](https://lmstudio.ai/))
  - [Window.ai](https://windowai.io/)
  - [Ollama](https://ollama.ai)
  - [KoboldCpp](https://github.com/LostRuins/koboldcpp)
  - [Oobabooga](https://github.com/oobabooga/text-generation-webui/wiki)
  - [OpenRouter](https://openrouter.ai/) (access to multiple AI models)
- Text-to-Speech
  - [Eleven Labs API](https://elevenlabs.io/)
  - [Speech T5](https://huggingface.co/microsoft/speecht5_tts)
  - [OpenAI](https://platform.openai.com/docs/guides/text-to-speech)
  - [Coqui (Local)](https://github.com/coqui-ai)
  - [RVC](https://github.com/SocAIty/Retrieval-based-Voice-Conversion-FastAPI)
  - [AllTalkTTS](https://github.com/erew123/alltalk_tts)
- Vision
  - [Bakllava](https://github.com/SkunkworksAI/BakLLaVA)

## 🛠️ Installation and running

To run this project locally, clone or download the repository.

NFTDrive fork operations assume the default branch `feat-add-injection`.

```bash
git clone https://github.com/nftdrive01-maker/amica-nftdrive.git
```

Install the required packages.

```bash
npm install
```

After installing the packages, start the development web server using the following command:

```bash
npm run dev
```

Once started, please visit the following URL to confirm that it is working properly.

[http://localhost:3000](http://localhost:3000)

### 📝 Configuration

Most of the configuration is done in the `.env.local` file. Reference the `config.ts` file for the available options.

#### OpenRouter Configuration

To use OpenRouter as a chat backend, set the following environment variables in your `.env.local` file:

- `NEXT_PUBLIC_OPENROUTER_APIKEY`: Your OpenRouter API key (required)
- `NEXT_PUBLIC_OPENROUTER_URL`: Custom OpenRouter API URL (optional, defaults to https://openrouter.ai/api/v1)
- `NEXT_PUBLIC_OPENROUTER_MODEL`: Default OpenRouter model (optional, defaults to openai/gpt-3.5-turbo)

```bash
amica
├── .env.local
├── src
│   ├── utils
│   │   └── config.ts
```

### 📦 Desktop Application

Amica uses [Tauri](https://tauri.app/) to build the desktop application.

To develop the desktop application, use the following command:

```bash
npm run tauri dev
```

## 📖 Documentation

View the [documentation](https://docs.heyamica.com) for more information on how to configure and use Amica.

## 📜 History

This project originated as a fork of ChatVRM by Pixiv:

[https://pixiv.github.io/ChatVRM](https://pixiv.github.io/ChatVRM)

## 🧠 Dynamic Knowledge Injection

Amica supports real-time dynamic knowledge injection via the **Injection Tool** (`d:\injection-tool`).

### What is Injection Tool?

A companion management tool that allows non-engineers to update AI's knowledge base without restarting Amica. 

- **Multi-domain support**: Switch between consultation, facility guide, emergency notices, etc.
- **Fail-open design**: Amica works normally even if Injection Tool stops
- **Hybrid caching**: Offline fallback using browser cache

### Quick Setup

1. Start Injection Tool in a separate terminal:
   ```bash
   cd d:\injection-tool
   npm run dev
   # Opens at http://localhost:4001
   ```

2. Add to Amica `.env.local`:
   ```env
   NEXT_PUBLIC_INJECTION_TOOL_URL=http://localhost:4001
   NEXT_PUBLIC_INJECTION_TOOL_ENABLED=true
   ```

3. Login to http://localhost:4001 with username/password from `.env.local`

4. Update domain prompts in `/admin` → Changes apply immediately to Amica

For detailed documentation, see [Injection Tool README](../injection-tool/README.md)

### Ark-i DBHub MCP result rows

Ark-i uses DBHub as a PostgreSQL MCP server for database lookup and SQL execution.
When `execute_sql` is used, the DB result panel in Amica displays the rows included in
`dbResult.previewRows`. Amica itself does not trim DB rows to 3 items; it only renders
the rows returned by Injection Tool.

If the DB result panel shows fewer rows than expected, check the DBHub row limit.
DBHub limits SELECT result rows with `--max-rows` / `max_rows`. In the Ark-i Docker
Compose setup, configure the DBHub service like this:

```yaml
dbhub:
  command:
    - --transport
    - http
    - --port
    - "8080"
    - --max-rows
    - "${DBHUB_MAX_ROWS:-1000}"
    - --dsn
    - "postgres://${DB_USER:-user}:${DB_PASSWORD:-password}@ark-database:5432/${DB_NAME:-dbname}"
```

After changing this setting, recreate DBHub from the WSL Docker environment:

```bash
docker compose up -d --force-recreate dbhub
```

Test message for `execute_sql` routing and result display:

```text
DBHub の execute_sql で次のSQLを実行してください。SELECT name, category, price_yen, stock_count FROM dbhub_test.products ORDER BY price_yen DESC;
```

Note: Web search prompt context intentionally summarizes only the first 3 web results.
That web-search limit is separate from the DB result panel row count.

## 🔒 License
* The majority of this project is released under the MIT license as found in the [LICENSE](https://github.com/nftdrive01-maker/amica-nftdrive/blob/feat-add-injection/LICENSE) file.
* Assets such as 3D models and images are released under their authors respective licenses.


## ✨ Star History
[![Star History](https://api.star-history.com/svg?repos=nftdrive01-maker/amica-nftdrive&type=Date)](https://star-history.com/#nftdrive01-maker/amica-nftdrive&Date)

## 🤗 Contributors

<a href="https://github.com/nftdrive01-maker/amica-nftdrive/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nftdrive01-maker/amica-nftdrive" />
</a>
