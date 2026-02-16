import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cross1Icon, PlusIcon } from '@radix-ui/react-icons';
import { useQuery } from '@tanstack/react-query';
import styled from 'styled-components';
import { searchTags } from '../api/media';
import { Button } from './Button';

interface TagEditorProps {
  tags: string[];
  onSave: (tags: string[]) => void;
}

// --- Styled components ---

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
  align-items: center;
  position: relative;
`;

const ChipBase = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: 2px ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.text};
`;

const ActiveChip = styled(ChipBase)<{ $isNew?: boolean }>`
  border: 1px solid
    ${({ $isNew, theme }) =>
      $isNew ? theme.colors.primary : theme.colors.border};
`;

const RemovedChip = styled(ChipBase)`
  border: 1px solid ${({ theme }) => theme.colors.border};
  text-decoration: line-through;
  opacity: 0.5;
  cursor: pointer;

  &:hover {
    opacity: 0.7;
  }
`;

const ChipRemove = styled.button`
  all: unset;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 1px;
  border-radius: 2px;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }

  svg {
    width: 10px;
    height: 10px;
  }
`;

const NewBadge = styled.span`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.colors.primary};
  margin-left: 2px;
`;

const AddTagButton = styled.button`
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 2px ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  border: 1px dashed ${({ theme }) => theme.colors.border};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    border-color: ${({ theme }) => theme.colors.text};
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const InputWrapper = styled.div`
  position: relative;
  display: inline-flex;
`;

const InlineInput = styled.input`
  all: unset;
  min-width: 120px;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.text};
  padding: 2px ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme }) => theme.colors.bg};

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Dropdown = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  min-width: 180px;
  margin-top: ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.xs} 0;
  list-style: none;
  z-index: 10;
  max-height: 200px;
  overflow-y: auto;
`;

const DropdownItem = styled.li<{ $highlighted?: boolean }>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  background: ${({ $highlighted, theme }) =>
    $highlighted ? theme.colors.surfaceHover : 'transparent'};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

// --- Helpers ---

function normalizeTag(input: string): string {
  return input.trim().toLowerCase();
}

function isValidTag(name: string): boolean {
  return name.length > 0 && name.length <= 30 && !/\s/.test(name);
}

// --- Component ---

export function TagEditor({ tags, onSave }: TagEditorProps) {
  // Draft state: the list of tags the user is building
  const [draftTags, setDraftTags] = useState<string[]>(tags);
  // Track which tags are newly created (not from autocomplete)
  const [newTags, setNewTags] = useState<Set<string>>(new Set());
  // Track which original tags have been removed
  const [removedTags, setRemovedTags] = useState<Set<string>>(new Set());

  // Input state
  const [showInput, setShowInput] = useState(false);
  const [input, setInput] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  // Reset draft when props change (e.g., after save triggers optimistic update)
  const [prevTags, setPrevTags] = useState(tags);
  if (prevTags !== tags) {
    setPrevTags(tags);
    setDraftTags(tags);
    setNewTags(new Set());
    setRemovedTags(new Set());
  }

  // Debounced query for autocomplete
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(input), 200);
    return () => clearTimeout(timer);
  }, [input]);

  const { data: suggestions } = useQuery({
    queryKey: ['tags', debouncedQuery],
    queryFn: () => searchTags(debouncedQuery),
    enabled: showInput && debouncedQuery.length > 0,
  });

  // Filter out tags already in draft (including removed ones we're still showing)
  const allDraftTagNames = useMemo(() => {
    const set = new Set(draftTags);
    removedTags.forEach((t) => set.add(t));
    return set;
  }, [draftTags, removedTags]);

  const filteredSuggestions = useMemo(
    () => suggestions?.tags.filter((t) => !allDraftTagNames.has(t.name)) ?? [],
    [suggestions, allDraftTagNames],
  );

  // Determine if "Create X" option should show
  const normalizedInput = normalizeTag(input);
  const exactMatchExists = filteredSuggestions.some(
    (t) => t.name === normalizedInput,
  );
  const alreadyInDraft = allDraftTagNames.has(normalizedInput);
  const showCreateOption =
    normalizedInput.length > 0 &&
    isValidTag(normalizedInput) &&
    !exactMatchExists &&
    !alreadyInDraft;

  // Total items in dropdown (suggestions + optional create)
  const totalDropdownItems =
    filteredSuggestions.length + (showCreateOption ? 1 : 0);
  const showDropdown = showInput && totalDropdownItems > 0 && input.length > 0;

  // Dirty check: draft differs from props
  const isDirty = useMemo(() => {
    if (removedTags.size > 0) return true;
    if (draftTags.length !== tags.length) return true;
    for (let i = 0; i < draftTags.length; i++) {
      if (draftTags[i] !== tags[i]) return true;
    }
    return false;
  }, [draftTags, tags, removedTags]);

  // --- Actions ---

  const addTag = useCallback(
    (name: string, isNew: boolean) => {
      const normalized = normalizeTag(name);
      if (!isValidTag(normalized)) return;

      // If it was a removed original tag being re-added, just un-remove it
      if (removedTags.has(normalized)) {
        setRemovedTags((prev) => {
          const next = new Set(prev);
          next.delete(normalized);
          return next;
        });
        setInput('');
        setHighlightIndex(-1);
        return;
      }

      if (draftTags.includes(normalized)) return;

      setDraftTags((prev) => [...prev, normalized]);
      if (isNew) {
        setNewTags((prev) => new Set(prev).add(normalized));
      }
      setInput('');
      setHighlightIndex(-1);
    },
    [draftTags, removedTags],
  );

  function removeChip(name: string) {
    // If it's an original tag, mark as removed (strikethrough)
    if (tags.includes(name)) {
      setRemovedTags((prev) => new Set(prev).add(name));
      setDraftTags((prev) => prev.filter((t) => t !== name));
    } else {
      // It's a newly added tag, remove entirely
      setDraftTags((prev) => prev.filter((t) => t !== name));
      setNewTags((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  }

  function restoreTag(name: string) {
    setRemovedTags((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
    // Re-add to draft in original position
    setDraftTags((prev) => {
      const originalIndex = tags.indexOf(name);
      const next = [...prev];
      // Insert at the position closest to original
      let insertAt = 0;
      for (let i = 0; i < next.length; i++) {
        const origIdx = tags.indexOf(next[i]);
        if (origIdx !== -1 && origIdx < originalIndex) {
          insertAt = i + 1;
        }
      }
      next.splice(insertAt, 0, name);
      return next;
    });
  }

  function handleSave() {
    onSave(draftTags);
    setShowInput(false);
    setInput('');
  }

  function handleCancel() {
    setDraftTags(tags);
    setNewTags(new Set());
    setRemovedTags(new Set());
    setShowInput(false);
    setInput('');
  }

  function openInput() {
    setShowInput(true);
    // Focus after render
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function closeInput() {
    setShowInput(false);
    setInput('');
    setHighlightIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeInput();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < totalDropdownItems) {
        if (highlightIndex < filteredSuggestions.length) {
          // Select existing suggestion
          addTag(filteredSuggestions[highlightIndex].name, false);
        } else {
          // "Create X" option
          addTag(normalizedInput, true);
        }
      } else if (showCreateOption) {
        addTag(normalizedInput, true);
      } else if (
        normalizedInput &&
        filteredSuggestions.some((t) => t.name === normalizedInput)
      ) {
        addTag(normalizedInput, false);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i < totalDropdownItems - 1 ? i + 1 : i));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : -1));
      return;
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value);
    setHighlightIndex(-1);
  }

  // Close input when clicking outside
  useEffect(() => {
    if (!showInput) return;

    function handleClick(e: MouseEvent) {
      if (
        inputWrapperRef.current &&
        !inputWrapperRef.current.contains(e.target as Node)
      ) {
        closeInput();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showInput]);

  // Build the ordered list of all tags to display (active + removed in original order)
  const displayItems = useMemo(() => {
    const items: Array<{
      name: string;
      status: 'active' | 'removed';
      isNew: boolean;
    }> = [];

    // First, show original tags in order (either active or removed)
    for (const tag of tags) {
      if (removedTags.has(tag)) {
        items.push({ name: tag, status: 'removed', isNew: false });
      } else if (draftTags.includes(tag)) {
        items.push({ name: tag, status: 'active', isNew: false });
      }
    }

    // Then show newly added tags
    for (const tag of draftTags) {
      if (!tags.includes(tag)) {
        items.push({ name: tag, status: 'active', isNew: newTags.has(tag) });
      }
    }

    return items;
  }, [tags, draftTags, removedTags, newTags]);

  return (
    <Container data-testid="tag-editor">
      <ChipRow>
        {displayItems.map((item) =>
          item.status === 'removed' ? (
            <RemovedChip
              key={item.name}
              data-testid="removed-tag-chip"
              onClick={() => restoreTag(item.name)}
              title="Click to restore"
            >
              {item.name}
            </RemovedChip>
          ) : (
            <ActiveChip
              key={item.name}
              $isNew={item.isNew}
              data-testid="tag-chip"
            >
              {item.name}
              {item.isNew && <NewBadge>new</NewBadge>}
              <ChipRemove
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(item.name);
                }}
                aria-label={`Remove ${item.name}`}
              >
                <Cross1Icon />
              </ChipRemove>
            </ActiveChip>
          ),
        )}

        {showInput ? (
          <InputWrapper ref={inputWrapperRef}>
            <InlineInput
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type tag name..."
              maxLength={30}
              data-testid="add-tag-input"
              autoComplete="off"
            />
            {showDropdown && (
              <Dropdown role="listbox" data-testid="tag-suggestions">
                {filteredSuggestions.map((tag, i) => (
                  <DropdownItem
                    key={tag.id}
                    role="option"
                    $highlighted={i === highlightIndex}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addTag(tag.name, false);
                    }}
                  >
                    {tag.name}
                  </DropdownItem>
                ))}
                {showCreateOption && (
                  <DropdownItem
                    role="option"
                    $highlighted={
                      highlightIndex === filteredSuggestions.length
                    }
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addTag(normalizedInput, true);
                    }}
                  >
                    Create &ldquo;{normalizedInput}&rdquo;
                  </DropdownItem>
                )}
              </Dropdown>
            )}
          </InputWrapper>
        ) : (
          <AddTagButton
            onClick={openInput}
            data-testid="add-tag-button"
            type="button"
          >
            <PlusIcon /> Add tag
          </AddTagButton>
        )}
      </ChipRow>

      {isDirty && (
        <ActionRow>
          <Button
            variant="primary"
            onClick={handleSave}
            data-testid="save-tags"
          >
            Save
          </Button>
          <Button
            variant="ghost"
            onClick={handleCancel}
            data-testid="cancel-tags"
          >
            Cancel
          </Button>
        </ActionRow>
      )}
    </Container>
  );
}
