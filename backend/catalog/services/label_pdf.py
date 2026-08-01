"""Sprint 28 — Deterministic label PDF generator.

Produces a minimal, valid PDF with a grid of label cells.  No third-party
dependency required — raw PDF bytes are emitted directly.  The output is
fully reproducible for the same input data.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from io import BytesIO

MM_TO_PT = 72.0 / 25.4  # 1 mm = 2.834645... pt


def _escape_pdf_text(text: str) -> bytes:
    return (
        text.replace('\\', '\\\\')
        .replace('(', '\\(')
        .replace(')', '\\)')
        .encode('latin-1', errors='replace')
    )


def _text_op(text: str, x: float, y: float, size: float = 7.0) -> bytes:
    return b'BT /F1 %s Tf %s %s Td (%s) Tj ET\n' % (
        str(size).encode(),
        str(round(x, 2)).encode(),
        str(round(y, 2)).encode(),
        _escape_pdf_text(text),
    )


def _rect_op(x: float, y: float, w: float, h: float) -> bytes:
    return b'%s %s %s %s re S\n' % (
        str(round(x, 2)).encode(),
        str(round(y, 2)).encode(),
        str(round(w, 2)).encode(),
        str(round(h, 2)).encode(),
    )


def _generate_labels(
    items: list[dict],
    show_name: bool,
    show_sku: bool,
    show_barcode: bool,
    show_price: bool,
) -> list[list[str]]:
    labels: list[list[str]] = []
    for item in items:
        lines: list[str] = []
        if show_name and item.get('name'):
            lines.append(item['name'])
        if show_sku and item.get('sku'):
            lines.append(f'SKU: {item["sku"]}')
        if show_barcode and item.get('ean'):
            lines.append(f'EAN: {item["ean"]}')
        if show_price and item.get('price') is not None:
            try:
                price = Decimal(str(item['price']))
                lines.append(f'R$ {price:,.2f}')
            except (InvalidOperation, TypeError, ValueError):
                lines.append('R$ --')
        labels.append(lines)
    return labels


def generate_label_pdf(
    items: list[dict],
    width_mm: Decimal,
    height_mm: Decimal,
    margin_mm: Decimal = Decimal('2.00'),
    columns: int = 2,
    rows: int = 5,
    show_sku: bool = True,
    show_barcode: bool = True,
    show_price: bool = True,
    show_name: bool = True,
) -> bytes:
    """Generate a PDF file containing label cells for the given items.

    ``items`` is a list of dicts, each containing:
        - sku: str
        - name: str
        - ean: str (barcode text)
        - price: Decimal or str

    Returns the PDF content as bytes.
    """
    cell_w_pt = float(width_mm) * MM_TO_PT
    cell_h_pt = float(height_mm) * MM_TO_PT
    margin_pt = float(margin_mm) * MM_TO_PT

    page_w_pt = margin_pt * 2 + columns * cell_w_pt
    page_h_pt = margin_pt * 2 + rows * cell_h_pt

    text_labels = _generate_labels(items, show_name, show_sku, show_barcode, show_price)

    # Build PDF objects.  Object numbering:
    #   1 = Catalog
    #   2 = Pages
    #   3 = Font
    #   4+ = per-page (content stream + page object)
    #
    # Build bottom-up so object numbers are known.

    objects: list[bytes] = []

    # -- Object 3: Font --------------------------------------------------------
    def _obj(content: bytes) -> int:
        objects.append(content)
        return len(objects)

    font_id = _obj(
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'
    )

    # -- One content stream + page object per sheet ---------------------------
    label_idx = 0
    page_ids: list[int] = []
    while label_idx < len(text_labels):
        stream = BytesIO()
        stream.write(b'q\n')
        stream.write(b'0.5 w\n')
        stream.write(b'0 0 0 rg\n')

        for row in range(rows):
            for col in range(columns):
                if label_idx >= len(text_labels):
                    break
                x = margin_pt + col * cell_w_pt
                y = page_h_pt - margin_pt - (row + 1) * cell_h_pt

                stream.write(_rect_op(x, y, cell_w_pt, cell_h_pt))

                lines = text_labels[label_idx]
                text_y = y + cell_h_pt - 10
                for line in lines:
                    stream.write(_text_op(line, x + 3, text_y, 7))
                    text_y -= 10

                label_idx += 1

        stream.write(b'Q\n')
        content_bytes = stream.getvalue()

        content_id = _obj(
            b'<< /Length %d >>\nstream\n%s\nendstream' % (len(content_bytes), content_bytes)
        )

        page_template = (
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %s %s] '
            b'/Contents %d 0 R /Resources << /Font << /F1 %d 0 R >> >> >>'
        )
        page_id = _obj(
            page_template
            % (
                str(round(page_w_pt, 2)).encode(),
                str(round(page_h_pt, 2)).encode(),
                content_id,
                font_id,
            )
        )
        page_ids.append(page_id)

    # -- Object 2: Pages -------------------------------------------------------
    kids_ref = b' '.join(b'%d 0 R' % pid for pid in page_ids)
    _obj(b'<< /Type /Pages /Kids [%s] /Count %d >>' % (kids_ref, len(page_ids)))

    # -- Object 1: Catalog -----------------------------------------------------
    _obj(b'<< /Type /Catalog /Pages 2 0 R >>')

    # -- Serialize -------------------------------------------------------------
    buf = BytesIO()
    buf.write(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')

    offsets: list[int] = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(buf.tell())
        buf.write(b'%d 0 obj\n' % i)
        buf.write(obj)
        buf.write(b'\nendobj\n')

    xref_offset = buf.tell()
    buf.write(b'xref\n')
    buf.write(b'0 %d\n' % (len(objects) + 1))
    buf.write(b'0000000000 65535 f \n')
    for off in offsets:
        buf.write(b'%010d 00000 n \n' % off)

    buf.write(b'trailer\n')
    buf.write(b'<< /Size %d /Root 1 0 R >>\n' % (len(objects) + 1))
    buf.write(b'startxref\n')
    buf.write(b'%d\n' % xref_offset)
    buf.write(b'%%EOF\n')

    return buf.getvalue()
