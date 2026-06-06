from google import genai
import os
import json


def get_gemini_client():
    # Creates and returns a Gemini API client using the key from .env
    # Centralised here so both functions use the same setup
    return genai.Client(api_key=os.environ.get('GEMINI_API_KEY'))


def parse_json_response(raw):
    """
    Cleans and parses Gemini's text response into a Python dictionary.
    Gemini sometimes wraps JSON in markdown fences (```json ... ```)
    despite being told not to — this handles that defensively.
    """
    # Strip opening fence if present (e.g. ```json or ```)
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1]

    # Strip closing fence if present
    if raw.endswith('```'):
        raw = raw.rsplit('\n', 1)[0]

    # Convert JSON string to Python dictionary
    return json.loads(raw.strip())


def analyse_resume(resume_text, job_description):
    """
    Sends resume text and job description to Gemini.
    Returns a structured dictionary with analysis results.
    """
    try:
        client = get_gemini_client()

        # The prompt uses {{ and }} to produce literal { } in the output
        # because this is an f-string — single { } would be treated as variables
        prompt = f"""
You are an expert resume analyser. Analyse the resume against the job description.

You MUST respond with ONLY a valid JSON object. No explanation, no markdown, no code blocks.
Just the raw JSON object starting with {{ and ending with }}.

Use this EXACT structure:
{{
  "match_score": <integer 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "keywords": {{
    "present": ["<keyword1>", "<keyword2>"],
    "missing": ["<keyword1>", "<keyword2>"]
  }},
  "sections": {{
    "work_experience": <integer 0-100>,
    "skills": <integer 0-100>,
    "projects": <integer 0-100>,
    "education": <integer 0-100>,
    "summary": <integer 0-100>
  }},
  "improvements": [
    "<specific improvement suggestion 1>",
    "<specific improvement suggestion 2>",
    "<specific improvement suggestion 3>"
  ],
  "weak_bullets": [
    "<weak bullet point from resume 1>",
    "<weak bullet point from resume 2>"
  ]
}}

RESUME:
{resume_text}

JOB DESCRIPTION:
{job_description}

IMPORTANT RULES FOR KEYWORDS:
Only mark a keyword as "present" if it is EXPLICITLY mentioned in the resume text.
Do not infer or assume skills from project descriptions or context.
If a skill is implied but not directly stated, mark it as "missing".
"""

        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=prompt
        )

        # Strip whitespace then parse — raises JSONDecodeError if Gemini
        # returns something that isn't valid JSON
        return parse_json_response(response.text.strip())

    except json.JSONDecodeError:
        # Gemini returned text that couldn't be parsed as JSON
        # Happens occasionally due to model non-determinism
        raise Exception('Gemini returned invalid JSON. Please try again.')
    except Exception as e:
        error_message = str(e)
        if '429' in error_message or 'RESOURCE_EXHAUSTED' in error_message:
            raise Exception('Daily analysis limit reached. Please try again tomorrow.')
        if '503' in error_message or 'UNAVAILABLE' in error_message:
            raise Exception('Gemini is currently busy. Please wait a moment and try again.')
        raise Exception(f'Gemini API error: {error_message}')


def rewrite_bullet(bullet_text):
    """
    Sends a single weak bullet point to Gemini.
    Returns a stronger rewritten version as a plain string.
    This is a separate lighter prompt — no JSON parsing needed.
    """
    try:
        client = get_gemini_client()

        prompt = f"""
You are an expert resume writer.
Rewrite the following weak resume bullet point to be stronger, more specific, and achievement-focused.
Use active voice. Start with a strong action verb. Be concise.
Return ONLY the rewritten bullet point. No explanation, no prefix, no quotes.

WEAK BULLET:
{bullet_text}
"""

        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=prompt
        )

        # No JSON parsing needed — rewrite response is plain text
        return response.text.strip()

    except Exception as e:
        error_message = str(e)
        if '429' in error_message or 'RESOURCE_EXHAUSTED' in error_message:
            raise Exception('Daily analysis limit reached. Please try again tomorrow.')
        if '503' in error_message or 'UNAVAILABLE' in error_message:
            raise Exception('Gemini is currently busy. Please wait a moment and try again.')
        raise Exception(f'Gemini API error: {error_message}')