import React from 'react';
import { useSearchParams } from 'react-router-dom';
import UnifiedSearch from '../components/search/UnifiedSearch';

const UnifiedSearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  return <UnifiedSearch initialQuery={initialQuery} />;
};

export default UnifiedSearchPage;