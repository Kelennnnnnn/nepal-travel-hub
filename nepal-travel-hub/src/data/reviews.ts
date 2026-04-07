export interface Review {
  id: string;
  activityId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  title: string;
  comment: string;
  date: string;
  helpful: number;
  verified: boolean;
  tripDate: string;
  photos?: string[];
}

export const mockReviews: Review[] = [
  {
    id: "r1",
    activityId: "1",
    userName: "Sarah Mitchell",
    rating: 5,
    title: "Life-changing experience!",
    comment: "The Everest Base Camp trek was absolutely incredible. Our guide Pemba was knowledgeable and made sure everyone was safe. The views were beyond anything I've ever seen. Highly recommend for anyone looking for a true adventure.",
    date: "2026-03-15",
    helpful: 24,
    verified: true,
    tripDate: "March 2026",
  },
  {
    id: "r2",
    activityId: "1",
    userName: "James Park",
    rating: 5,
    title: "Well organized trek",
    comment: "Everything was perfectly organized from start to finish. The teahouses were comfortable and the food was surprisingly good. The acclimatization schedule was well planned.",
    date: "2026-02-28",
    helpful: 18,
    verified: true,
    tripDate: "February 2026",
  },
  {
    id: "r3",
    activityId: "1",
    userName: "Maria Garcia",
    rating: 4,
    title: "Amazing but tough",
    comment: "Beautiful scenery and great guides. The altitude was challenging but manageable with proper preparation. Would have liked one more rest day for acclimatization.",
    date: "2026-01-20",
    helpful: 12,
    verified: true,
    tripDate: "January 2026",
  },
  {
    id: "r4",
    activityId: "2",
    userName: "David Chen",
    rating: 5,
    title: "Spotted a rhino up close!",
    comment: "The safari exceeded all expectations. We saw rhinos, deer, and so many bird species. The canoe ride at sunrise was magical. The naturalist guide was incredibly knowledgeable.",
    date: "2026-03-10",
    helpful: 15,
    verified: true,
    tripDate: "March 2026",
  },
  {
    id: "r5",
    activityId: "2",
    userName: "Emma Wilson",
    rating: 4,
    title: "Great wildlife experience",
    comment: "Wonderful experience in Chitwan. The elephant safari was a highlight. Accommodation was basic but clean. Would definitely recommend bringing binoculars.",
    date: "2026-02-15",
    helpful: 9,
    verified: true,
    tripDate: "February 2026",
  },
  {
    id: "r6",
    activityId: "4",
    userName: "Tom Anderson",
    rating: 5,
    title: "Best 30 minutes of my life!",
    comment: "Paragliding over Pokhara was absolutely breathtaking. The views of Phewa Lake and the Annapurna range were unreal. The pilot was very experienced and made me feel completely safe.",
    date: "2026-03-20",
    helpful: 31,
    verified: true,
    tripDate: "March 2026",
  },
  {
    id: "r7",
    activityId: "4",
    userName: "Lisa Nakamura",
    rating: 5,
    title: "Unforgettable views",
    comment: "This was my first time paragliding and I couldn't have picked a better location. The team was professional and the GoPro footage they provided was excellent quality.",
    date: "2026-03-05",
    helpful: 22,
    verified: true,
    tripDate: "March 2026",
  },
  {
    id: "r8",
    activityId: "5",
    userName: "Robert Brown",
    rating: 4,
    title: "Cultural immersion at its best",
    comment: "Our guide brought the history of Kathmandu to life. Visiting the temples and squares with someone so knowledgeable made all the difference. Wish the tour was a bit longer.",
    date: "2026-02-22",
    helpful: 7,
    verified: true,
    tripDate: "February 2026",
  },
];

export function getReviewsForActivity(activityId: string): Review[] {
  return mockReviews.filter((r) => r.activityId === activityId);
}

export function getAverageRating(activityId: string): { average: number; count: number; distribution: number[] } {
  const reviews = getReviewsForActivity(activityId);
  if (reviews.length === 0) return { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
  
  const distribution = [0, 0, 0, 0, 0];
  let total = 0;
  reviews.forEach((r) => {
    total += r.rating;
    distribution[r.rating - 1]++;
  });
  
  return {
    average: total / reviews.length,
    count: reviews.length,
    distribution,
  };
}
