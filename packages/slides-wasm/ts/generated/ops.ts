// Generated from slides-core by its tests. Do not edit.
import type { AcceptMarks } from "./AcceptMarks";
import type { Accepted } from "./Accepted";
import type { AddCitation } from "./AddCitation";
import type { AddDiagram } from "./AddDiagram";
import type { AddElements } from "./AddElements";
import type { AddSection } from "./AddSection";
import type { AddSlide } from "./AddSlide";
import type { AddSlides } from "./AddSlides";
import type { AddedCitation } from "./AddedCitation";
import type { AddedDiagram } from "./AddedDiagram";
import type { AddedElements } from "./AddedElements";
import type { AddedSlide } from "./AddedSlide";
import type { AddedSlides } from "./AddedSlides";
import type { AlignElements } from "./AlignElements";
import type { ApplyTheme } from "./ApplyTheme";
import type { BuildSteps } from "./BuildSteps";
import type { BuiltSteps } from "./BuiltSteps";
import type { CollapseSlides } from "./CollapseSlides";
import type { Collapsed } from "./Collapsed";
import type { DeleteElements } from "./DeleteElements";
import type { DeleteSlides } from "./DeleteSlides";
import type { DistributeElements } from "./DistributeElements";
import type { DuplicateElements } from "./DuplicateElements";
import type { DuplicateSlides } from "./DuplicateSlides";
import type { DuplicatedElements } from "./DuplicatedElements";
import type { DuplicatedSlides } from "./DuplicatedSlides";
import type { EditTheme } from "./EditTheme";
import type { ExpandComposite } from "./ExpandComposite";
import type { ExpandedComposite } from "./ExpandedComposite";
import type { GroupElements } from "./GroupElements";
import type { Grouped } from "./Grouped";
import type { MoveSlides } from "./MoveSlides";
import type { PasteElements } from "./PasteElements";
import type { PatchElements } from "./PatchElements";
import type { RemoveSection } from "./RemoveSection";
import type { RenameSection } from "./RenameSection";
import type { ReorderElements } from "./ReorderElements";
import type { ReplaceAll } from "./ReplaceAll";
import type { ReplaceDeck } from "./ReplaceDeck";
import type { Replaced } from "./Replaced";
import type { SetBackground } from "./SetBackground";
import type { SetLayout } from "./SetLayout";
import type { SetLayoutOutput } from "./SetLayoutOutput";
import type { SetLogo } from "./SetLogo";
import type { SetNotes } from "./SetNotes";
import type { SetRichText } from "./SetRichText";
import type { SetSlideFlags } from "./SetSlideFlags";
import type { SetSlideSteps } from "./SetSlideSteps";
import type { SetStepStates } from "./SetStepStates";
import type { SetText } from "./SetText";
import type { SetTitle } from "./SetTitle";
import type { SetTransition } from "./SetTransition";
import type { TransformElements } from "./TransformElements";
import type { UngroupElement } from "./UngroupElement";
import type { Ungrouped } from "./Ungrouped";

/** Each operation with the type of its input and of what it returns. */
export interface OpMap {
  set_title: { input: SetTitle; output: null };
  apply_theme: { input: ApplyTheme; output: null };
  edit_theme: { input: EditTheme; output: null };
  set_logo: { input: SetLogo; output: null };
  add_slide: { input: AddSlide; output: AddedSlide };
  add_slides: { input: AddSlides; output: AddedSlides };
  replace_deck: { input: ReplaceDeck; output: null };
  duplicate_slides: { input: DuplicateSlides; output: DuplicatedSlides };
  delete_slides: { input: DeleteSlides; output: null };
  move_slides: { input: MoveSlides; output: null };
  add_section: { input: AddSection; output: null };
  rename_section: { input: RenameSection; output: null };
  remove_section: { input: RemoveSection; output: null };
  set_slide_flags: { input: SetSlideFlags; output: null };
  set_transition: { input: SetTransition; output: null };
  set_slide_steps: { input: SetSlideSteps; output: null };
  set_step_states: { input: SetStepStates; output: null };
  build_steps: { input: BuildSteps; output: BuiltSteps };
  collapse_slides: { input: CollapseSlides; output: Collapsed };
  set_layout: { input: SetLayout; output: SetLayoutOutput };
  set_notes: { input: SetNotes; output: null };
  set_background: { input: SetBackground; output: null };
  add_elements: { input: AddElements; output: AddedElements };
  add_diagram: { input: AddDiagram; output: AddedDiagram };
  add_citation: { input: AddCitation; output: AddedCitation };
  patch_elements: { input: PatchElements; output: null };
  transform_elements: { input: TransformElements; output: null };
  delete_elements: { input: DeleteElements; output: null };
  reorder_elements: { input: ReorderElements; output: null };
  group_elements: { input: GroupElements; output: Grouped };
  ungroup_element: { input: UngroupElement; output: Ungrouped };
  expand_composite: { input: ExpandComposite; output: ExpandedComposite };
  duplicate_elements: { input: DuplicateElements; output: DuplicatedElements };
  paste_elements: { input: PasteElements; output: DuplicatedElements };
  align_elements: { input: AlignElements; output: null };
  distribute_elements: { input: DistributeElements; output: null };
  set_text: { input: SetText; output: null };
  set_rich_text: { input: SetRichText; output: null };
  replace_all: { input: ReplaceAll; output: Replaced };
  accept_marks: { input: AcceptMarks; output: Accepted };
}

export type OpName = keyof OpMap;

export const OP_NAMES = [
  "set_title",
  "apply_theme",
  "edit_theme",
  "set_logo",
  "add_slide",
  "add_slides",
  "replace_deck",
  "duplicate_slides",
  "delete_slides",
  "move_slides",
  "add_section",
  "rename_section",
  "remove_section",
  "set_slide_flags",
  "set_transition",
  "set_slide_steps",
  "set_step_states",
  "build_steps",
  "collapse_slides",
  "set_layout",
  "set_notes",
  "set_background",
  "add_elements",
  "add_diagram",
  "add_citation",
  "patch_elements",
  "transform_elements",
  "delete_elements",
  "reorder_elements",
  "group_elements",
  "ungroup_element",
  "expand_composite",
  "duplicate_elements",
  "paste_elements",
  "align_elements",
  "distribute_elements",
  "set_text",
  "set_rich_text",
  "replace_all",
  "accept_marks",
] as const;
