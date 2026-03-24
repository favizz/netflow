export interface JwtPayload {
  sub: string;            // resident email
  role: 'resident';
  unitId: number | null;
  unitNo: string | null;
}
