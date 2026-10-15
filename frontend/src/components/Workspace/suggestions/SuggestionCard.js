import React from 'react';
import SuggestionFrame from './SuggestionFrame';
import SlidesSection from './SlidesSection';
import BlockChangeList from '../diff/BlockChangeList';

// kind = 'edit': пропозиція з правками блоків. applicable=false → порада без кнопки «Прийняти».
// loadSlides(suggestionId, optionId) передається лише для pptx.
const SuggestionCard = ({ suggestion, loadSlides = null, ...frameProps }) => (
  <SuggestionFrame suggestion={suggestion} {...frameProps}>
    <BlockChangeList
      changes={suggestion.changes}
      emptyText="Для цієї пропозиції немає змін у тексті."
    />
    {loadSlides && suggestion.changes?.length > 0 && (
      <SlidesSection
        loadSlides={(optionId) => loadSlides(suggestion.id, optionId)}
        resetKey={`${suggestion.id}:${suggestion.versionsCount || 0}`}
      />
    )}
  </SuggestionFrame>
);

export default SuggestionCard;
