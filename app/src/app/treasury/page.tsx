import TreasuryApp from './TreasuryApp';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Treasury review · AegisAgent' };
export default function TreasuryPage() {
  return <TreasuryApp sample={process.env.SAMPLE_MODE === 'true'} />;
}
