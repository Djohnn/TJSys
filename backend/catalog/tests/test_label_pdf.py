"""Sprint 28 — tests for label PDF generation."""

from decimal import Decimal

from catalog.services.label_pdf import generate_label_pdf


def test_generate_single_label():
    items = [
        {
            'sku': 'SKU-001',
            'name': 'Produto Teste',
            'ean': '7891234567890',
            'price': '49.90',
        },
    ]
    pdf = generate_label_pdf(
        items=items,
        width_mm=Decimal('50'),
        height_mm=Decimal('30'),
        margin_mm=Decimal('2'),
        columns=2,
        rows=5,
    )
    assert pdf[:5] == b'%PDF-'
    assert b'%%EOF' in pdf[-20:]
    assert b'/Type /Page' in pdf
    assert b'/Type /Catalog' in pdf
    assert b'Produto Teste' in pdf
    assert b'SKU-001' in pdf
    assert b'7891234567890' in pdf
    assert b'R$ 49.90' in pdf


def test_generate_multiple_labels():
    items = [
        {'sku': 'A', 'name': 'Item A', 'ean': '111', 'price': '10.00'},
        {'sku': 'B', 'name': 'Item B', 'ean': '222', 'price': '20.00'},
        {'sku': 'C', 'name': 'Item C', 'ean': '333', 'price': '30.00'},
        {'sku': 'D', 'name': 'Item D', 'ean': '444', 'price': '40.00'},
        {'sku': 'E', 'name': 'Item E', 'ean': '555', 'price': '50.00'},
        {'sku': 'F', 'name': 'Item F', 'ean': '666', 'price': '60.00'},
    ]
    pdf = generate_label_pdf(
        items=items,
        width_mm=Decimal('60'),
        height_mm=Decimal('40'),
        margin_mm=Decimal('3'),
        columns=3,
        rows=4,
    )
    assert pdf[:5] == b'%PDF-'
    assert b'%%EOF' in pdf[-20:]
    for item in items:
        assert item['name'].encode() in pdf


def test_pdf_includes_all_configured_fields():
    items = [
        {'sku': 'X', 'name': 'Full', 'ean': '999', 'price': '99.99'},
    ]
    pdf = generate_label_pdf(
        items=items,
        width_mm=Decimal('50'),
        height_mm=Decimal('30'),
        show_sku=True,
        show_barcode=True,
        show_price=True,
        show_name=True,
    )
    assert b'Full' in pdf
    assert b'SKU: X' in pdf
    assert b'EAN: 999' in pdf
    assert b'R$ 99.99' in pdf


def test_pdf_respects_hidden_fields():
    items = [
        {'sku': 'H', 'name': 'Hidden', 'ean': '000', 'price': '0.50'},
    ]
    pdf = generate_label_pdf(
        items=items,
        width_mm=Decimal('50'),
        height_mm=Decimal('30'),
        show_sku=False,
        show_barcode=False,
        show_price=False,
        show_name=True,
    )
    assert b'Hidden' in pdf
    assert b'SKU:' not in pdf
    assert b'EAN:' not in pdf
    assert b'R$' not in pdf


def test_pdf_handles_missing_fields():
    items = [
        {'sku': '', 'name': '', 'ean': '', 'price': ''},
    ]
    pdf = generate_label_pdf(
        items=items,
        width_mm=Decimal('50'),
        height_mm=Decimal('30'),
        show_sku=True,
        show_barcode=True,
        show_price=True,
        show_name=True,
    )
    assert pdf[:5] == b'%PDF-'
    assert b'%%EOF' in pdf[-20:]
    assert b'/Type /Page' in pdf


def test_pdf_benchmark_many_labels():
    items = [
        {
            'sku': f'SKU-{i:03d}',
            'name': f'Produto {i:03d}',
            'ean': f'{i:013d}',
            'price': f'{i % 100}.00',
        }
        for i in range(50)
    ]
    pdf = generate_label_pdf(
        items=items,
        width_mm=Decimal('60'),
        height_mm=Decimal('40'),
        columns=2,
        rows=5,
    )
    assert pdf[:5] == b'%PDF-'
    assert len(pdf) > 500


def test_deterministic_output():
    items = [
        {'sku': 'DET', 'name': 'Deterministico', 'ean': '123', 'price': '1.00'},
    ]
    pdf1 = generate_label_pdf(
        items=items,
        width_mm=Decimal('50'),
        height_mm=Decimal('30'),
    )
    pdf2 = generate_label_pdf(
        items=items,
        width_mm=Decimal('50'),
        height_mm=Decimal('30'),
    )
    assert pdf1 == pdf2
