import React from 'react';
import { useSearchParams } from 'react-router-dom';
import UnifiedSearch from '../components/search/UnifiedSearch';

const UnifiedSearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialType = (searchParams.get('type') as 'fts5' | 'fuzzy' | 'hybrid') || 'fts5';

  return <UnifiedSearch initialQuery={initialQuery} initialType={initialType} />;
};

export default UnifiedSearchPage;