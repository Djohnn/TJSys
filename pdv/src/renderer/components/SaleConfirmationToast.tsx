interface SaleConfirmationToastProps {
  saleId: string;
  saleNumber: string;
  hasFiscalConfig: boolean;
  onPrintFiscal: () => void;
  onPrintBalcao: () => void;
  onClose: () => void;
}

export function SaleConfirmationToast({
  saleNumber,
  hasFiscalConfig,
  onPrintFiscal,
  onPrintBalcao,
  onClose,
}: SaleConfirmationToastProps) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 1000,
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        padding: '20px',
        minWidth: '320px',
        maxWidth: '400px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ fontSize: '1.25rem' }}>✅</span>
        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#2e7d32' }}>
          Venda nº {saleNumber} realizada com sucesso.
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onPrintFiscal}
          disabled={!hasFiscalConfig}
          title={!hasFiscalConfig ? 'Configuração fiscal não disponível' : undefined}
          style={{
            flex: 1,
            padding: '10px 16px',
            border: '1px solid #1976d2',
            borderRadius: '8px',
            background: hasFiscalConfig ? '#1976d2' : '#e0e0e0',
            color: hasFiscalConfig ? '#fff' : '#9e9e9e',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: hasFiscalConfig ? 'pointer' : 'not-allowed',
            minWidth: '120px',
          }}
        >
          Imprimir Cupom Fiscal
        </button>
        <button
          type="button"
          onClick={onPrintBalcao}
          style={{
            flex: 1,
            padding: '10px 16px',
            border: '1px solid #1976d2',
            borderRadius: '8px',
            background: '#fff',
            color: '#1976d2',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            minWidth: '120px',
          }}
        >
          Imprimir Cupom Balcão
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '10px 16px',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            background: '#fff',
            color: '#757575',
            fontWeight: 500,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
