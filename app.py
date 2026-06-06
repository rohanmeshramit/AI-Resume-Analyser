from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from extractor import extract_text_from_pdf
from analyser import analyse_resume, rewrite_bullet
from database import init_db, save_analysis, get_all_analyses
from database import init_db, save_analysis, get_all_analyses, delete_analysis #duplicacy detected from above line
import os

load_dotenv()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max upload

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf'}

# Initialise database when Flask starts — creates the file and table if they don't exist
init_db()


def allowed_file(filename):
    # Checks extension after the last dot — handles filenames like my.resume.v2.pdf correctly
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        # Validate file exists in request
        if 'resume' not in request.files:
            return jsonify({'error': 'No file was sent.'}), 400

        file = request.files['resume']

        if file.filename == '':
            return jsonify({'error': 'No file selected.'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': 'Only PDF files are allowed.'}), 400

        # Validate job description
        job_description = request.form.get('job_description', '').strip()
        if not job_description:
            return jsonify({'error': 'Please paste a job description.'}), 400

        # Save file temporarily — only needed for PyMuPDF to read
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(filepath)

        # Extract text then delete — resume content is never stored permanently
        extracted_text = extract_text_from_pdf(filepath)
        os.remove(filepath)

        # Send to Gemini for structured analysis
        analysis = analyse_resume(extracted_text, job_description)

        # Save metadata to database — score and job title only, not resume content
        version = save_analysis(analysis['match_score'], job_description)

        return jsonify({
            'success': True,
            'analysis': analysis,
            'version': version
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/history', methods=['GET'])
def history():
    # GET — read only, no body needed
    try:
        analyses = get_all_analyses()
        return jsonify({'success': True, 'analyses': analyses})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

@app.route('/history/<int:analysis_id>', methods=['DELETE'])
def delete_history(analysis_id):
    try:
        delete_analysis(analysis_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/rewrite', methods=['POST'])
def rewrite_bullet_route():
    try:
        data = request.get_json()
        bullet = data.get('bullet', '').strip()

        if not bullet:
            return jsonify({'error': 'No bullet point provided.'}), 400

        # Rewrite logic lives in analyser.py — all AI calls in one place
        rewritten = rewrite_bullet(bullet)

        return jsonify({'success': True, 'rewritten': rewritten})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)