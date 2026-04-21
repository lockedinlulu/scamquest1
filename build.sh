#!/bin/bash
cat > config.js << EOF
export const GROQ_API_KEY = "$GROQ_API_KEY";
export const TAVILY_API_KEY = "$TAVILY_API_KEY";
export const ELEVENLABS_API_KEY = "$ELEVENLABS_API_KEY";
EOF