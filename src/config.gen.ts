/**
* @generated
*/

export const config = {
  "isurus.gemini.token": {
    "type": "string",
    "default": "",
    "description": "Gemini API Token."
  },
  "isurus.openai.token": {
    "type": "string",
    "default": "",
    "description": "OpenAI API Token."
  },
  "isurus.langchain.token": {
    "type": "string",
    "default": "",
    "description": "Langchain API Token."
  },
  "isurus.prometheus.url": {
    "type": "string",
    "default": "http://localhost:9090",
    "description": "Prometheus URL."
  },
  "isurus.benchmark.url": {
    "type": "string",
    "default": "http://localhost:6061",
    "description": "Benchmark information URL."
  }
} as const;
