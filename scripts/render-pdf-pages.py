"""Renderiza cada página de un PDF a PNG para que tesseract.js pueda OCRarla.

Uso: python render-pdf-pages.py <pdf> <directorio-salida> [dpi]
No modifica el PDF de entrada; solo escribe imágenes temporales.
"""
import os
import sys

import fitz

pdf_path, out_dir = sys.argv[1], sys.argv[2]
dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 160

os.makedirs(out_dir, exist_ok=True)
doc = fitz.open(pdf_path)
matrix = fitz.Matrix(dpi / 72, dpi / 72)
for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    pix.save(os.path.join(out_dir, f"page-{index + 1:04d}.png"))
print(len(doc))
