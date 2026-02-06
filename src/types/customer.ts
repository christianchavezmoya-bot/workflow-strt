export interface Customer {
  id: string;
  name: string;
  customerId: string;
  office: "USA" | "Australia" | "South Africa" | "All";
  logo?: string | null;
  logoShape: 'none' | 'round' | 'rectangular';
  photoScale: number;
  logoSize: number;
}
