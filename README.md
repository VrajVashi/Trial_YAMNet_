# 🛡️ Silent Sentinel: Intelligent Safety Monitoring

## Project Objective
Silent Sentinel is a **deployable, AI-powered safety system** designed for **deaf, hard-of-hearing, and elderly people**. It transforms everyday devices into an intelligent safety layer that converts critical environmental sounds into immediate, understandable, and actionable alerts.

### How it Works
1.  **Edge Detection**: Continuously listens using a local sound classification model (YAMNet) to respect privacy and ensure speed.
2.  **AI Reasoning**: Uses **Anthropic’s Claude** as a high-level reasoning engine to analyze detection context, urgency, and history.
3.  **Accessible Alerts**: Delivers strong visual and vibration alerts for emergencies like fire alarms, glass breaking, or thuds (falls).

---

## Server Setup (Backend)

The server handles the AI verification using the Anthropic API.

1.  Navigate to the `server` directory:
    ```bash
    cd server
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  **Configure API Key**:
    - Open the `.env` file in the `server` directory.
    - Replace the placeholder value for `ANTHROPIC_API_KEY` with your actual API key.
    - Example `.env` content:
      ```env
      ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE...
      PORT=5001
      ```

4.  Start the server:
    ```bash
    node server.js
    ```
    You should see: `🚀 Server running on port 5001`

## Client Setup (Frontend)

The client runs the local sound detection.

1.  Navigate to the `client` directory.
2.  Because the client uses ES modules (`<script type="module">`), you cannot just double-click `index.html`. You need to serve it using a local web server.
    - **Option A (using Python):**
      ```bash
      # Run inside the client directory
      python -m http.server 8000
      ```
      Then open `http://localhost:8000` in your browser.
    
    - **Option B (using VS Code Live Server):**
      Right-click `index.html` and select "Open with Live Server".

## Note on Functionality
Currently, the client detects sounds locally but does not appear to send them to the server for verification automatically. The server endpoint `/verify-sound` is ready to accept requests, but the client code needs to be updated to call it.
