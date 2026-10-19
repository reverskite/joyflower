import { AdminDetail } from '../../../admin-ui';
export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <AdminDetail id={(await params).id}/>;
}
