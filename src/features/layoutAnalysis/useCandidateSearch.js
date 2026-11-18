import { useState } from 'react';
import { layoutAnalysisApi } from '../../api/layoutAnalysis';

export const useCandidateSearch = ({ setStatus }) => {
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);

  const findCandidates = async (input) => {
    try {
      setStatus('ScoreBoard 곡 목록에서 후보를 찾는 중입니다…');
      const response = await layoutAnalysisApi.findCandidates(input);
      setCandidates(response.candidates || []);
      setSelected(null);
      setStatus(response.candidates?.length
        ? ['정확한 곡과 채보를 선택하세요.', ...(response.warnings || [])].join(' ')
        : response.warnings?.[0] || '후보를 찾지 못했습니다.');
    } catch (error) {
      setStatus(error?.appError?.message || error?.message || String(error));
    }
  };

  return { candidates, selected, setCandidates, setSelected, findCandidates };
};
