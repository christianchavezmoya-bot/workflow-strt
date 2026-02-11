export interface Customer {
  id: string;
  name: string;
  customerId: string;
  office: string;
  industry?: string | null;
  logo?: string | null;
  logoShape: 'none' | 'round' | 'rectangular';
  photoScale: number;
  logoSize: number;
}
