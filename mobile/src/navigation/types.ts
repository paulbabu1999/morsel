/** Navigation param lists. MealDetail lives at the ROOT stack so it can be
 *  opened from both the Feed tab and the Ask tab (citation cards). */

export type RootStackParamList = {
  Tabs: undefined;
  MealDetail: { mealId: string };
};

export type RootTabParamList = {
  Capture: undefined;
  Feed: undefined;
  Stats: undefined;
  Ask: undefined;
  Profile: undefined;
};
