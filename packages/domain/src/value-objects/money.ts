/**
 * Money value object.
 *
 * All monetary amounts in the system are stored as integers (cents) to
 * avoid floating-point rounding errors. This value object wraps the
 * integer and provides safe arithmetic and formatting.
 *
 * Convention: never pass raw numbers across module boundaries for money —
 * always use Money.fromCents() or Money.fromDollars().
 */
export class Money {
  private constructor(
    private readonly _cents: number,
    private readonly _currency: string,
  ) {
    if (!Number.isInteger(_cents)) {
      throw new Error(`Money amount must be an integer (cents). Received: ${_cents}`);
    }
    if (_cents < 0) {
      throw new Error(`Money amount cannot be negative. Received: ${_cents}`);
    }
  }

  static fromCents(cents: number, currency = 'USD'): Money {
    return new Money(cents, currency.toUpperCase());
  }

  static fromDollars(dollars: number, currency = 'USD'): Money {
    return new Money(Math.round(dollars * 100), currency.toUpperCase());
  }

  static zero(currency = 'USD'): Money {
    return new Money(0, currency);
  }

  get cents(): number {
    return this._cents;
  }

  get currency(): string {
    return this._currency;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this._cents + other._cents, this._currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const result = this._cents - other._cents;
    if (result < 0) {
      throw new Error(
        `Subtraction would result in negative money: ${this._cents} - ${other._cents}`,
      );
    }
    return new Money(result, this._currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this._cents * factor), this._currency);
  }

  equals(other: Money): boolean {
    return this._cents === other._cents && this._currency === other._currency;
  }

  isZero(): boolean {
    return this._cents === 0;
  }

  toFormattedString(locale = 'en-US'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this._currency,
    }).format(this._cents / 100);
  }

  toJSON(): { cents: number; currency: string } {
    return { cents: this._cents, currency: this._currency };
  }

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Currency mismatch: cannot operate on ${this._currency} and ${other._currency}`,
      );
    }
  }
}
