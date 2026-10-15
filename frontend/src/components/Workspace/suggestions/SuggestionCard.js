import React from 'react';
import SuggestionFrame from './SuggestionFrame';
import BlockChangeList from '../diff/BlockChangeList';

// kind = 'edit': пропозиція з правками блоків. applicable=false → порада без кнопки «Прийняти».
const SuggestionCard = ({ suggestion, ...frameProps }) => (
  <SuggestionFrame suggestion={suggestion} {...frameProps}>
    <BlockChangeList
      changes={suggestion.changes}
      emptyText="Для цієї пропозиції немає змін у тексті."
    />
  </SuggestionFrame>
);

export default SuggestionCard;
