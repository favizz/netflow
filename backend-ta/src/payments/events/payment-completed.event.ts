export class PaymentCompletedEvent {
  constructor(
    public readonly transactionId: string,
    public readonly unitNo: string,
    public readonly electricityAmountRp: number,
    public readonly waterAmountRp: number,
    public readonly method: string,
    public readonly timestamp: Date,
  ) {}
}
