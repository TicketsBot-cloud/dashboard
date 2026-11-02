// maxLength counts UTF-16 units, so an emoji would count twice.
export function codePointMaxLength(max: number, value: string): number {
  return max + value.length - [...value].length;
}
