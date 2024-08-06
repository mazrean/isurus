export interface Model {
  generateResponse(input: string): Promise<string>;
}
