# Local Gemma 4 model files

The mobile-web runtime expects a local browser model artifact here.

Default path used by the app shell:

`/models/gemma-4-E4B-it-web.task`

Pull it from the repository root with:

```bash
rtk npm run pull:gemma4:e4b
```

The pull script downloads from:

`https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task`

If Hugging Face requires authentication or license acceptance, set `HF_TOKEN`
before running the script. The downloaded `.task` / `.litertlm` artifacts are
intentionally gitignored because they are large runtime assets, not source code.

If this machine cannot resolve or reach Hugging Face, download the model by
another route and install it with:

```bash
GEMMA4_E4B_MODEL_SOURCE=/path/to/gemma-4-E4B-it-web.task rtk npm run pull:gemma4:e4b
```

`GEMMA4_E4B_MODEL_SOURCE` may be a local path, a `file://` URL, or a reachable
HTTP(S) mirror. `GEMMA4_E4B_OUTPUT` can override the destination path.

You can switch the loader to another `.task` or `.litertlm` file by passing a
different `modelAssetPath` to `loadGemma4WebHumanizer()`.

The browser runtime loads its Wasm files from:

`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm`
