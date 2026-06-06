import sqlite3
from datetime import datetime

# Database file — created automatically on first run
DATABASE = 'resume_analyser.db'


def init_db():
    """
    Creates the database file and analyses table if they don't exist.
    Safe to call on every Flask startup — IF NOT EXISTS prevents duplication.
    """
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS analyses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            version     INTEGER NOT NULL,
            match_score INTEGER NOT NULL,
            timestamp   TEXT NOT NULL,
            job_title   TEXT NOT NULL
        )
    ''')

    conn.commit()
    conn.close()


def save_analysis(match_score, job_description):
    """
    Saves a new analysis record to the database.
    Version number is derived from total existing records + 1.
    Returns the new version number.
    """
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    # Version = total existing rows + 1
    cursor.execute('SELECT COUNT(*) FROM analyses')
    version = cursor.fetchone()[0] + 1

    # Store first 60 chars of job description as a readable label
    job_title = job_description[:60].strip()
    timestamp = datetime.now().strftime('%d %b %Y, %H:%M')

    # ? placeholders prevent SQL injection — never use f-strings in SQL queries
    cursor.execute('''
        INSERT INTO analyses (version, match_score, timestamp, job_title)
        VALUES (?, ?, ?, ?)
    ''', (version, match_score, timestamp, job_title))

    conn.commit()
    conn.close()

    return version


def get_all_analyses():
    """
    Returns all analyses as a list of dictionaries, newest first.
    Converts SQLite tuples to dicts so Flask's jsonify() can serialise them
    and JavaScript can access fields by name (item.match_score vs item[2]).
    """
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, version, match_score, timestamp, job_title
        FROM analyses
        ORDER BY id DESC
    ''')

    rows = cursor.fetchall()
    conn.close()

    # Convert each tuple row to a named dictionary
    return [
        {
            'id':          row[0],
            'version':     row[1],
            'match_score': row[2],
            'timestamp':   row[3],
            'job_title':   row[4]
        }
        for row in rows
    ]
def delete_analysis(analysis_id):
    """
    Deletes a single analysis record by its ID.
    Called from the /history/<id> DELETE route in app.py.
    """
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    cursor.execute('DELETE FROM analyses WHERE id = ?', (analysis_id,))

    conn.commit()
    conn.close()