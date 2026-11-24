export const apexCourses = [
  {
    id: "solstice",
    version: "solstice-2",
    label: "Solstice Pass",
    description: "Climbing bends, a lakeside viaduct, and a covered mountain gallery.",
    image: "/game-captures/solstice.webp",
  },
  {
    id: "whitecap",
    version: "whitecap-1",
    label: "Whitecap Summit",
    description: "Snowbound switchbacks, an avalanche shed, and snowbanks that narrow the road.",
    image: "/game-captures/whitecap.webp",
  },
  {
    id: "breakwater",
    version: "breakwater-1",
    label: "Breakwater Coast",
    description: "Oceanfront sweepers, a tight harbor loop, and staggered construction barriers.",
    image: "/game-captures/breakwater.webp",
  },
] as const;

export type ApexCourse = (typeof apexCourses)[number];
export type ApexCourseId = ApexCourse["id"];

export function getApexCourse(id: string): ApexCourse {
  return apexCourses.find((course) => course.id === id) ?? apexCourses[0];
}
