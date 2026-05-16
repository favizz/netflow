export interface JwtPayload {
  sub: string;
  role: 'resident' | 'admin';
  unitId: number | null;
  unitNo: string | null;
  name?: string | null;
}
