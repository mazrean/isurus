/**
* @generated
*/

export const config = {
  "isurus.server.path": {
    "type": "string",
    "default": "isurus-server",
    "description": "Server command path."
  },
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
  "isurus.isutools.url": {
    "type": "string",
    "default": "http://localhost:6061",
    "description": "isutools URL."
  },
  "isurus.app.name": {
    "type": "string",
    "default": "app",
    "description": "Application name."
  },
  "isurus.db.name": {
    "type": "string",
    "default": "mysqld",
    "description": "Database name."
  }
} as const;

export const commands = [
  {
    "command": "isurus.helloWorld",
    "title": "Hello World"
  },
  {
    "command": "isurus.generateResponse",
    "title": "Generate Response"
  },
  {
    "command": "isurus.analyzeCPU",
    "title": "Analyze CPU"
  }
] as const;
