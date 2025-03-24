import { redirect } from 'next/navigation';

export async function GET() {
  return redirect('/api/auth/authorize');
} 