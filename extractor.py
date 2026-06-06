import fitz  # PyMuPDF — installed as pymupdf, imports as fitz


def extract_text_from_pdf(filepath):
    """
    Opens a PDF file and extracts all text from every page.
    Returns cleaned text as a single string.
    Raises a human-readable exception if the file is unreadable or image-based.
    """
    try:
        doc = fitz.open(filepath)

        # Extract text page by page — PDFs store content per page, not as one block
        full_text = []
        for page in doc:
            full_text.append(page.get_text())

        doc.close()

        cleaned_text = clean_text('\n'.join(full_text))

        # A very short result usually means the PDF is a scanned image
        # PyMuPDF cannot extract text from images — only from text-based PDFs
        if len(cleaned_text.strip()) < 50:
            raise Exception(
                'This PDF appears to be a scanned image. '
                'Please upload a text-based PDF resume.'
            )

        return cleaned_text

    except Exception as e:
        raise Exception(str(e))


def clean_text(text):
    """
    Strips blank lines and leading/trailing whitespace from each line.
    Keeps the text readable without unnecessary gaps.
    """
    lines = text.splitlines()
    cleaned_lines = [line.strip() for line in lines if line.strip()]
    return '\n'.join(cleaned_lines)