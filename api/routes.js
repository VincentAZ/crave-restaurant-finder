import {handleRestaurantRequest} from '../lib/restaurant-service.js';
export function POST(request){return handleRestaurantRequest(request,'routes');}
