import hashlib
import hmac
from decimal import Decimal

from .base import IntentResult, PaymentProvider, TransactionResult


class FakePaymentProvider(PaymentProvider):
    def __init__(self, *, secret):
        self._secret = secret

    def __repr__(self):
        return '<FakePaymentProvider secret=[REDACTED]>'

    __str__ = __repr__

    def create_intent(self, *, amount, idempotency_key):
        status = 'failed' if idempotency_key.startswith('fail') else 'authorized'
        return IntentResult(
            reference=f'fake-intent-{idempotency_key}',
            status=status,
            amount=Decimal(str(amount)),
        )

    def capture(self, intent_reference, amount):
        return TransactionResult(
            reference=f'{intent_reference}-capture',
            status='succeeded',
            amount=Decimal(str(amount)),
        )

    def cancel(self, intent_reference):
        return TransactionResult(
            reference=f'{intent_reference}-cancel',
            status='succeeded',
            amount=Decimal('0.00'),
        )

    def refund(self, transaction_reference, amount):
        return TransactionResult(
            reference=f'{transaction_reference}-refund',
            status='succeeded',
            amount=Decimal(str(amount)),
        )

    def sign(self, payload):
        return hmac.new(self._secret.encode(), payload, hashlib.sha256).hexdigest()

    def verify_signature(self, payload, signature):
        return hmac.compare_digest(self.sign(payload), signature or '')
