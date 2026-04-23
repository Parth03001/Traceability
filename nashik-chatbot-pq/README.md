# Nashik Quality Intelligence Chatbot (PQ)

## Introduction
The Nashik Quality Intelligence Chatbot is an advanced AI-powered assistant designed for **Traceability**, **Warranty Analysis**, and **Quality Guideline** management for the Thar Roxx project. It leverages a **GraphRAG** (Graph-based Retrieval-Augmented Generation) architecture, combining the power of Graph Databases (Neo4j) for structured relationship analysis and Vector Databases (OpenSearch) for semantic search across technical guidelines.

### Key Capabilities
- **Traceability Analysis**: Query complex relationships between parts, chassis, and manufacturing data.
- **Warranty Insights**: Analyze warranty claims, PPCM data, and e-SQA records.
- **Guideline RAG**: Semantic search across 200+ PDF quality guidelines and standard operating procedures.
- **Part Sense Visualizer (PartLabeler)**: Mapped component visualization with interactive graphs and CAD-based labeling.
- **Multi-Agent System**: Specialized agents for Cypher generation, data analysis, and standard guidelines.

---

## Project Structure

```text
nashik-chatbot-pq/
├── app/
│   ├── agents/
│   ├── chat_history/
│   ├── config/
│   ├── connectors/
│   ├── models/
│   ├── prompts/
│   ├── queries/
│   ├── services/
│   ├── tools/
│   └── utils/
├── backend/
│   ├── api/
│   ├── models/
│   └── services/
├── frontend/
│   ├── src/components/
│   └── src/services/
├── dataloader/
│   ├── embedding/
│   └── scraper/
├── scripts/
│   └── data_loading.py
├── csv_data/
├── documents/
├── ssl/                    # Nginx-ready SSL certificates (.pem)
├── certificate/            # Source certificates (.cer, .pfx)
├── tasks.py
└── docker-compose.yml
```

---

## Component Overview

- **`app/agents`**: The multi-agent system. Each agent (e.g., `CypherAgent`) is responsible for a specific domain.
- **`app/connectors`**: Abstracts database complexity. If you change a DB, you only update this layer.
- **`backend/`**: A standard FastAPI structure that serves the frontend and handles authentication.
- **`dataloader/`**: Dedicated to unstructured data. It handles PDF parsing, chunking, and vector storage.
- **`scripts/`**: Handles high-volume structured data. Optimized for loading millions of rows into Neo4j.
- **`PartLabeler`**: A specialized module that maps warranty data to visual components for trend analysis.

---

## How to Add a New Agent

To extend the chatbot's capabilities with a new specialized agent:

1.  **Define the Prompt**: Create a new prompt file in `app/prompts/` (e.g., `expert_agent_prompt.py`). Define the `SYSTEM_PROMPT`.
2.  **Create the Agent Class**: Create a new file in `app/agents/` (e.g., `expert_agent.py`). Inherit from the base agent logic and implement the `run()` or `process()` method.
3.  **Register in Agent Pool**: Open `app/agents/agent_pool.py` and add your new agent to the factory so the system can instantiate it.
4.  **Update Orchestration**: If this agent needs to be part of the main chat flow, update the router logic in `app/agents/agent_pool.py` to decide when to call this new agent.

---

## Roles & Access

| Role | Access |
|------|--------|
| `admin` | All features + Admin Panel (manage users, assign roles, delete accounts) |
| `user` | All features — default role given on public signup |
| `part_labeler` | Part Sense Visualizer Field & Plant only |

> **Note:** `admin` and `part_labeler` accounts are **not** created through public signup.  
> Use the seed script below or the **Admin Panel → Add User** button to create them.

---

## Creating Admin Users

The script `scripts/create_users.py` creates a single user with a chosen role.  
It is idempotent — running it twice with the same username skips the duplicate silently.

### Arguments

| Flag | Default | Description |
|------|---------|-------------|
| `--username` | *(prompted)* | Login username |
| `--email` | *(prompted)* | Email address |
| `--first-name` | *(prompted, default: `Admin`)* | First name |
| `--last-name` | *(prompted, default: `User`)* | Last name |
| `--password` | *(prompted securely)* | Omit for secure interactive prompt |
| `--role` | `admin` | `admin` \| `user` \| `part_labeler` |

### Local development

```bash
cd nashik-chatbot-pq

# Fully interactive — all fields prompted
python scripts/create_users.py

# Non-interactive — pass all flags
python scripts/create_users.py \
    --username admin \
    --first-name Admin \
    --last-name User \
    --email admin@company.com \
    --password "Admin@1234" \
    --role admin
```

### Docker

```bash
# Fully interactive
docker exec -it traceability-app \
    python scripts/create_users.py

# Non-interactive (all flags)
docker exec -it traceability-app \
    python scripts/create_users.py \
    --username admin \
    --first-name Admin \
    --last-name User \
    --email admin@company.com \
    --password "Admin@1234" \
    --role admin
```

---

## Setup Guide (VM / Production)

### 1. Prerequisites
- **Docker & Docker Compose** (Recommended)
- **Azure OpenAI API Access**: Requires `gpt-4o` and `text-embedding-3-small`.
- **Hardware**: Minimum 16GB RAM (32GB recommended for full data loading).

### 2. Environment Configuration
Copy the example environment file and fill in your credentials:
```bash
cp .env.example .env
```

### 3. SSL Configuration (Production)
The system uses Nginx with SSL for secure communication.
1. Place your source certificates (`.cer`, `.pfx`) in the `certificate/ssl/` directory.
2. Generate Nginx-compatible `.pem` files using the provided script:
```bash
bash generate_proper_ssl.sh
```
3. Ensure the `ssl/` directory contains:
   - `fullchain.pem` (Server + Intermediate)
   - `key.pem` (Private Key)
   - `ca-chain.crt` (Intermediate + Root)

### 4. Deployment
Launch the entire stack:
```bash
docker compose up -d --build
```
The application will be available at `https://mai-quality-bot-uat.m-devsecops.com` (or your configured domain).

---

## Local Development Setup

For local development without Docker, you will need to manually install and configure the following dependencies:

1. **PostgreSQL**: For session state and relational data.
2. **Neo4j**: For graph-based traceability data.
3. **OpenSearch**: For vector embeddings and guideline RAG.
4. **Nginx**: For local proxy and SSL termination (optional for local).
5. **Python 3.10+ & Node.js 18+**: For running the backend and frontend services.

### Backend Setup:
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Frontend Setup:
```bash
cd frontend
npm install
npm start
```

---

## Data Loading Instructions

All commands below should be run inside the `traceability-app` container.

### A. Loading Structured Data (Graph DB)
1. Place CSV files inside `csv_data/`.
2. Run the Graph loader (Neo4j):
```bash
docker exec -it traceability-app python scripts/data_loading.py
```

### B. Loading Data for Part Sense Visualizer (Relational DB)
To enable component mapping and trend graphs:
```bash
docker exec -it traceability-app invoke process-warranty-data
```

### C. Loading Guideline Documents (RAG)
1. Place PDFs inside the `documents/` folder.
2. Scrape and Embed:
```bash
docker exec -it traceability-app invoke scrape-documents
docker exec -it traceability-app invoke create-embeddings
```

---

## Tech Stack
- **Backend**: FastAPI (Python)
- **Frontend**: React.js, Recharts, Lucide Icons
- **Graph DB**: Neo4j (Cypher)
- **Vector DB**: OpenSearch (Vector search)
- **Relational DB**: PostgreSQL (Session state, history, and raw warranty data)
- **LLM**: Azure OpenAI (GPT-4o)
- **Proxy**: Nginx (serving frontend and securing traffic via SSL)
