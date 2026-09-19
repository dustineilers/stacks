# Stacks Recipe Import API

Small FastAPI service that imports recipes from URLs by extracting Schema.org
Recipe JSON-LD from the returned HTML.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API docs:
http://localhost:8000/docs

## Request

```bash
curl -X POST http://localhost:8000/api/import/recipe   -H "Content-Type: application/json"   -d '{"url":"https://example.com/recipe"}'
```

## Stacks frontend

```js
const response = await fetch("http://localhost:8000/api/import/recipe", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url })
});

const data = await response.json();

if (!response.ok) {
  throw new Error(data.detail || "Import failed");
}

console.log(data.recipe);
```

## Notes

The importer deliberately uses recipe structured data exposed by the source
page. It does not attempt to defeat authentication, subscription systems, or
other access controls. If the fetched HTML does not contain an accessible
Schema.org Recipe object, the API returns a useful error instead.
