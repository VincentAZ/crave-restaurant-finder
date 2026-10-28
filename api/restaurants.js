import {handleRestaurantRequest} from '../lib/restaurant-service.js';
export function GET(request){return handleRestaurantRequest(request,'places');}
